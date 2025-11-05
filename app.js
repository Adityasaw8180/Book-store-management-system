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

// book details
app.get(
  "/books/all",
  wrapAsync(async (req, res) => {
    const books = await db.any(
      `SELECT 
         b.title,
         b.isbn,
         b.publisher_name,
         b.year,
         b.price,
         a.name AS author_name
       FROM book b
       JOIN bookauthor ba ON b.isbn = ba.book_isbn
       JOIN author a ON ba.author_id = a.author_id
       ORDER BY b.title;`
    );

    res.render("books/all", { books });
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
      `INSERT INTO bookauthor (author_id, book_isbn)
      VALUES ($1, $2)`,
      [author_id, isbn]
    );

    res.redirect("/books");
  } catch (err) {
    console.error("🔥 Error inserting book:", err);
    next(err);
  }
});

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
  console.log("✅ App is listening on port 8080");
});
