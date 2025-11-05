const express = require("express");
const path = require("path");
const db = require("./db");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync");
const {
  validateBook,
  validateAuthor,
  validatePublisher,
} = require("./middleware/validation");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Home ----------
app.get(
  "/",
  wrapAsync(async (req, res) => {
    const [bookResult, authorResult, publisherResult] = await Promise.all([
      db.one("SELECT COUNT(*) AS total_books FROM book"),
      db.one("SELECT COUNT(*) AS total_authors FROM author"),
      db.one("SELECT COUNT(*) AS total_publishers FROM publisher"),
    ]);

    res.render("home.ejs", {
      activePage: "home",
      totalBooks: parseInt(bookResult.total_books, 10),
      totalAuthors: parseInt(authorResult.total_authors, 10),
      totalPublishers: parseInt(publisherResult.total_publishers, 10),
    });
  })
);

// ---------- Books ----------
app.get(
  "/books",
  wrapAsync(async (req, res) => {
    const books = await db.any(`
      SELECT
        book.isbn,
        book.title,
        book.year,
        book.price,
        publisher.name AS publisher,
        publisher.address AS publisher_address,
        publisher.phone AS publisher_phone
      FROM book
      LEFT JOIN publisher
        ON book.publisher_name = publisher.name
      ORDER BY book.title;
    `);
    res.render("books/show", { books, activePage: "books" });
  })
);

app.get(
  "/books/new",
  wrapAsync(async (req, res) => {
    const authors = await db.any(
      "SELECT author_id, name FROM author ORDER BY name"
    );
    const publishers = await db.any("SELECT name FROM publisher ORDER BY name");
    res.render("books/new", { authors, publishers });
  })
);

// Edit book form
app.get(
  "/books/:isbn/edit",
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;

    const book = await db.oneOrNone(
      `SELECT isbn, title, year AS publication_year, price, publisher_name FROM book WHERE isbn = $1`,
      [isbn]
    );
    if (!book) {
      const err = new Error("Book not found");
      err.statusCode = 404;
      throw err;
    }

    const authors = await db.any("SELECT author_id, name FROM author ORDER BY name");
    const publishers = await db.any("SELECT name FROM publisher ORDER BY name");

    // get current author for this book (if any)
    const bookAuthor = await db.oneOrNone(
      "SELECT author_id FROM bookauthor WHERE isbn = $1",
      [isbn]
    );

    res.render("books/edit", {
      book,
      authors,
      publishers,
      currentAuthorId: bookAuthor ? bookAuthor.author_id : null,
    });
  })
);

// Update book (POST used here instead of PUT for simplicity)
app.post(
  "/books/:isbn",
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;
    const {
      title,
      author_id,
      publisher_name,
      publication_year,
      price,
    } = req.body.book;

    // ensure book exists
    const existing = await db.oneOrNone("SELECT isbn FROM book WHERE isbn = $1", [isbn]);
    if (!existing) {
      const err = new Error("Book not found");
      err.statusCode = 404;
      throw err;
    }

    // Update book record
    await db.none(
      `UPDATE book SET title = $1, year = $2, price = $3, publisher_name = $4 WHERE isbn = $5`,
      [title, publication_year, price, publisher_name, isbn]
    );

    // Update bookauthor link: remove existing and add the new one
    await db.none("DELETE FROM bookauthor WHERE isbn = $1", [isbn]);
    await db.none("INSERT INTO bookauthor (author_id, isbn) VALUES ($1, $2)", [author_id, isbn]);

    res.redirect("/books");
  })
);

app.post("/books", async (req, res, next) => {
  try {
    const { title, isbn, author_id, publisher_name, publication_year, price } =
      req.body.book;

    // Insert into the book table
    await db.none(
      `INSERT INTO book (isbn, title, year, price, publisher_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [isbn, title, publication_year, price, publisher_name]
    );

    // Insert into the BookAuthor table (link author to this book)
    await db.none(
      `INSERT INTO bookauthor (author_id, isbn)
      VALUES ($1, $2)`,
      [author_id, isbn]
    );

    res.redirect("/books");
  } catch (err) {
    console.error("🔥 Error inserting book:", err);
    next(err);
  }
});

// Delete a book and its related bookauthor links
app.post(
  "/books/delete/:isbn",
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;

    const existing = await db.oneOrNone("SELECT isbn FROM book WHERE isbn = $1", [isbn]);
    if (!existing) {
      const err = new Error("Book not found");
      err.statusCode = 404;
      throw err;
    }

    // remove relations first, then the book
    await db.none("DELETE FROM bookauthor WHERE isbn = $1", [isbn]);
    await db.none("DELETE FROM book WHERE isbn = $1", [isbn]);

    res.redirect("/books");
  })
);
 
// ---------- Authors ----------
app.get(
  "/authors",
  wrapAsync(async (req, res) => {
    const authors = await db.any("SELECT * FROM author ORDER BY author_id");
    res.render("authors/show", { authors, activePage: "authors" });
  })
);

app.get("/authors/new", (req, res) => res.render("authors/new"));

app.post(
  "/authors",
  validateAuthor,
  wrapAsync(async (req, res) => {
    const { name, url, address } = req.body.author;
    const newId = await db.one(
      "SELECT COALESCE(MAX(author_id), 0) + 1 AS next_id FROM author"
    );
    await db.none(
      "INSERT INTO author (author_id, name, url, address) VALUES ($1, $2, $3, $4)",
      [newId.next_id, name, url, address]
    );
    res.redirect("/authors");
  })
);

// ---------- Publishers ----------
app.get(
  "/publishers",
  wrapAsync(async (req, res) => {
    const publishers = await db.any("SELECT * FROM publisher ORDER BY name");
    res.render("publishers/show", { publishers, activePage: "publishers" });
  })
);

app.get("/publishers/new", (req, res) => res.render("publishers/new"));

app.post(
  "/publishers",
  validatePublisher,
  wrapAsync(async (req, res) => {
    const { name, address, url, phone } = req.body.publisher;
    await db.none(
      "INSERT INTO publisher (name, address, url, phone) VALUES ($1, $2, $3, $4)",
      [name, address, url, phone]
    );
    res.redirect("/publishers");
  })
);

// ---------- Error Handler ----------
app.use(errorHandler);

// ---------- Start Server ----------
app.listen(8080, () => {
  console.log("App is listening on port http://localhost:8080");
});
