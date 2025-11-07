const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const { errorHandler } = require("./middleware/errorHandler");
const wrapAsync = require("./utils/wrapAsync");
const db = require("./db");

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));

// Controllers & Routes
const bookRoutes = require("./routes/bookRoutes");
const authorRoutes = require("./routes/authorRoutes");
const publisherRoutes = require("./routes/publisherRoutes");

app.use("/books", bookRoutes);
app.use("/authors", authorRoutes);
app.use("/publishers", publisherRoutes);

// Home
app.get(
  "/",
  wrapAsync(async (req, res) => {
    const [bookCount, authorCount, publisherCount, recentBooks] =
      await Promise.all([
        db.one("SELECT COUNT(*) AS total_books FROM book"),
        db.one("SELECT COUNT(*) AS total_authors FROM author"),
        db.one("SELECT COUNT(*) AS total_publishers FROM publisher"),
        db.any(`
      SELECT b.title, b.isbn, b.year, b.price, a.name AS author_name, b.publisher_name
      FROM book b
      JOIN bookauthor ba ON b.isbn = ba.book_isbn
      JOIN author a ON ba.author_id = a.author_id
      ORDER BY b.year DESC LIMIT 4
    `),
      ]);

    res.render("home.ejs", {
      activePage: "home",
      totalBooks: parseInt(bookCount.total_books, 10),
      totalAuthors: parseInt(authorCount.total_authors, 10),
      totalPublishers: parseInt(publisherCount.total_publishers, 10),
      recentBooks,
    });
  })
);

// Search route
app.get(
  "/search",
  wrapAsync(async (req, res) => {
    const searchTerm = req.query.query?.trim();
    if (!searchTerm) return res.redirect("/");

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

    if (books.length === 0) {
      books = await db.any(`SELECT * FROM book WHERE title ILIKE $1`, [
        `%${searchTerm}%`,
      ]);
      if (books.length > 0) searchType = "book name";
    }

    res.render("books/searchResults", { books, searchTerm, searchType });
  })
);

// Error Handler
app.use(errorHandler);


app.listen(8080, () => console.log("App listening on port http://localhost:8080"));
