const db = require("../db");

// List all books
module.exports.listBooks = async (req, res) => {
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
};

// Show new book form
module.exports.showNewForm = async (req, res) => {
  const authors = await db.any(
    "SELECT author_id, name FROM author ORDER BY name"
  );
  const publishers = await db.any("SELECT name FROM publisher ORDER BY name");
  res.render("books/new", { authors, publishers });
};

// show all details of book
module.exports.allBooks = async (req, res) => {
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
};

// Create a new book
module.exports.createBook = async (req, res) => {
  const { title, isbn, author_id, publisher_name, publication_year, price } =
    req.body.book;
  await db.none(
    `INSERT INTO book (isbn, title, year, price, publisher_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [isbn, title, publication_year, price, publisher_name]
  );
  await db.none(
    `INSERT INTO bookauthor (author_id, book_isbn) VALUES ($1, $2)`,
    [author_id, isbn]
  );
  res.redirect("/books");
};

// Show edit book form
module.exports.showEditForm = async (req, res) => {
  const { isbn } = req.params;
  const book = await db.one("SELECT * FROM book WHERE isbn = $1", [isbn]);
  const bookAuthor = await db.oneOrNone(
    "SELECT author_id FROM bookauthor WHERE book_isbn = $1",
    [isbn]
  );
  const authors = await db.any("SELECT * FROM author ORDER BY author_id");
  const publishers = await db.any("SELECT * FROM publisher ORDER BY name");
  res.render("books/edit", {
    book,
    currentAuthorId: bookAuthor?.author_id,
    authors,
    publishers,
  });
};

// Update book
module.exports.updateBook = async (req, res) => {
  const { isbn } = req.params;
  const { title, publication_year, price, publisher_name, author_id } =
    req.body.book;

  await db.none(
    `UPDATE book SET title = $1, year = $2, price = $3, publisher_name = $4 WHERE isbn = $5`,
    [title, publication_year, price, publisher_name, isbn]
  );

  await db.none(`UPDATE bookauthor SET author_id = $1 WHERE book_isbn = $2`, [
    author_id,
    isbn,
  ]);

  res.redirect("/books");
};

// Delete book
module.exports.deleteBook = async (req, res) => {
  const { isbn } = req.params;
  await db.none("DELETE FROM bookauthor WHERE book_isbn = $1", [isbn]);
  await db.none("DELETE FROM book WHERE isbn = $1", [isbn]);
  res.redirect("/books");
};
