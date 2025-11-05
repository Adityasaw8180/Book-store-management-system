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
const methodOverride = require("method-override");
const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));

// ---------- Home ----------
app.get(
  "/",
  wrapAsync(async (req, res) => {
    const [bookResult, authorResult, publisherResult, recentBooks] =
      await Promise.all([
        db.one("SELECT COUNT(*) AS total_books FROM book"),
        db.one("SELECT COUNT(*) AS total_authors FROM author"),
        db.one("SELECT COUNT(*) AS total_publishers FROM publisher"),
        db.any(
          `SELECT 
              b.title,
              b.isbn,
              b.year,
              b.price,
              a.name AS author_name,
              b.publisher_name
           FROM book b
           JOIN bookauthor ba ON b.isbn = ba.book_isbn
           JOIN author a ON ba.author_id = a.author_id
           ORDER BY b.year DESC
           LIMIT 4;`
        ),
      ]);

    res.render("home.ejs", {
      activePage: "home",
      totalBooks: parseInt(bookResult.total_books, 10),
      totalAuthors: parseInt(authorResult.total_authors, 10),
      totalPublishers: parseInt(publisherResult.total_publishers, 10),
      recentBooks,
    });
  })
);

app.get(
  "/search",
  wrapAsync(async (req, res) => {
    const searchTerm = req.query.query?.trim();
    if (!searchTerm) return res.redirect("/books");

    let books = [];
    let searchType = "";

    // Search by ISBN
    books = await db.any("SELECT * FROM book WHERE isbn = $1", [searchTerm]);
    if (books.length > 0) searchType = "isbn";

    // Search by publisher
    if (books.length === 0) {
      books = await db.any("SELECT * FROM book WHERE publisher_name ILIKE $1", [
        `%${searchTerm}%`,
      ]);
      if (books.length > 0) searchType = "publisher";
    }

    // Search by author
    if (books.length === 0) {
      books = await db.any(
        `SELECT b.*, a.name AS author_name
       FROM book b
       JOIN bookauthor ba ON b.isbn = ba.book_isbn
       JOIN author a ON a.author_id = ba.author_id
       WHERE a.name ILIKE $1`,
        [`%${searchTerm}%`]
      );
      if (books.length > 0) searchType = "author";
    }

    res.render("books/searchResults", { books, searchTerm, searchType });
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

app.post(
  "/books",
  validateBook,
  wrapAsync(async (req, res) => {
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
  })
);

app.get(
  "/books/:isbn/edit",
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;

    // Fetch current book details
    const book = await db.one(`SELECT * FROM book WHERE isbn = $1`, [isbn]);

    // Fetch author linked to this book
    const bookAuthor = await db.oneOrNone(
      `SELECT author_id FROM bookauthor WHERE book_isbn = $1`,
      [isbn]
    );

    // Fetch all authors and publishers for dropdowns
    const authors = await db.any(`SELECT * FROM author ORDER BY author_id`);
    const publishers = await db.any(`SELECT * FROM publisher ORDER BY name`);

    res.render("books/edit", {
      book,
      currentAuthorId: bookAuthor?.author_id,
      authors,
      publishers,
    });
  })
);

app.put(
  "/books/:isbn",
  validateBook,
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;
    const { title, publication_year, price, publisher_name, author_id } =
      req.body.book;

    // Update book table
    await db.none(
      `UPDATE book
       SET title = $1, year = $2, price = $3, publisher_name = $4
       WHERE isbn = $5`,
      [title, publication_year, price, publisher_name, isbn]
    );

    // Update author relation
    await db.none(
      `UPDATE bookauthor
       SET author_id = $1
       WHERE book_isbn = $2`,
      [author_id, isbn]
    );

    res.redirect("/books");
  })
);

app.delete(
  "/books/delete/:isbn",
  wrapAsync(async (req, res) => {
    const { isbn } = req.params;

    // Start by checking if book exists
    const book = await db.oneOrNone("SELECT * FROM book WHERE isbn = $1", [
      isbn,
    ]);
    if (!book) {
      req.flash("error", "Book not found!");
      return res.redirect("/books");
    }

    // Delete from bookauthor (to maintain referential integrity)
    await db.none("DELETE FROM bookauthor WHERE book_isbn = $1", [isbn]);

    // Delete from book table
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

app.get(
  "/authors/:id/edit",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const author = await db.oneOrNone(
      "SELECT * FROM author WHERE author_id = $1",
      [id]
    );

    if (!author) {
      throw new Error("Author not found");
    }

    res.render("authors/edit", { author });
  })
);

app.put(
  "/authors/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    const { name, url, address } = req.body.author;

    // Update author table
    await db.none(
      `
      UPDATE author
      SET name = $1, url = $2, address = $3
      WHERE author_id = $4
      `,
      [name, url, address, id]
    );

    res.redirect("/authors");
  })
);

app.delete(
  "/authors/delete/:id",
  wrapAsync(async (req, res) => {
    const { id } = req.params;

    // Check if author exists
    const author = await db.oneOrNone(
      "SELECT * FROM author WHERE author_id = $1",
      [id]
    );
    if (!author) {
      req.flash("error", "Author not found!");
      return res.redirect("/authors");
    }

    // Delete links from bookauthor first (to avoid FK constraint errors)
    await db.none("DELETE FROM bookauthor WHERE author_id = $1", [id]);

    // Delete author from author table
    await db.none("DELETE FROM author WHERE author_id = $1", [id]);

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

app.get(
  "/publishers/:name/edit",
  wrapAsync(async (req, res) => {
    const { name } = req.params;
    const publisher = await db.oneOrNone(
      "SELECT * FROM publisher WHERE name = $1",
      [name]
    );
    if (!publisher) {
      throw new Error("Publisher not found");
    }
    res.render("publishers/edit", { publisher });
  })
);

app.put(
  "/publishers/:name",
  wrapAsync(async (req, res) => {
    const { name } = req.params;
    const { new_name, address, phone } = req.body.publisher;

    await db.tx(async (t) => {
      // Update publisher details
      await t.none(
        `UPDATE publisher SET name = $1, address = $2, phone = $3 WHERE name = $4`,
        [new_name, address, phone, name]
      );

      // Reflect change in book table (if name is updated)
      if (new_name !== name) {
        await t.none(
          `UPDATE book SET publisher_name = $1 WHERE publisher_name = $2`,
          [new_name, name]
        );
      }
    });

    res.redirect("/publishers");
  })
);

app.delete(
  "/publishers/delete/:name",
  wrapAsync(async (req, res) => {
    const { name } = req.params;

    // Check if publisher exists
    const publisher = await db.oneOrNone(
      "SELECT * FROM publisher WHERE name = $1",
      [name]
    );
    if (!publisher) {
      req.flash("error", "Publisher not found!");
      return res.redirect("/publishers");
    }

    // Get all books by this publisher
    const books = await db.any(
      "SELECT isbn FROM book WHERE publisher_name = $1",
      [name]
    );

    // Delete related bookauthor entries first (FK safety)
    for (let book of books) {
      await db.none("DELETE FROM bookauthor WHERE book_isbn = $1", [book.isbn]);
    }

    // Delete books published by this publisher
    await db.none("DELETE FROM book WHERE publisher_name = $1", [name]);

    // Finally, delete the publisher itself
    await db.none("DELETE FROM publisher WHERE name = $1", [name]);

    res.redirect("/publishers");
  })
);

// ---------- Error Handler ----------
app.use(errorHandler);

// ---------- Start Server ----------
app.listen(8080, () => {
  console.log("✅ App is listening on port 8080");
});
