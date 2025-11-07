const db = require("../db");

module.exports.listAuthors = async (req, res) => {
  const authors = await db.any("SELECT * FROM author ORDER BY author_id");
  res.render("authors/show", { authors, activePage: "authors" });
};

module.exports.renderNewForm = (req, res) => {
  res.render("authors/new");
};

module.exports.createAuthor = async (req, res) => {
  const { name, url, address } = req.body.author;
  const newId = await db.one(
    "SELECT COALESCE(MAX(author_id),0)+1 AS next_id FROM author"
  );
  await db.none(
    "INSERT INTO author (author_id,name,url,address) VALUES ($1,$2,$3,$4)",
    [newId.next_id, name, url, address]
  );
  res.redirect("/authors");
};

module.exports.renderEditForm = async (req, res) => {
  const { id } = req.params;
  const author = await db.oneOrNone(
    "SELECT * FROM author WHERE author_id = $1",
    [id]
  );
  if (!author) throw new Error("Author not found");
  res.render("authors/edit", { author });
};

module.exports.updateAuthor = async (req, res) => {
  const { id } = req.params;
  const { name, url, address } = req.body.author;
  await db.none(
    "UPDATE author SET name=$1, url=$2, address=$3 WHERE author_id=$4",
    [name, url, address, id]
  );
  res.redirect("/authors");
};

module.exports.deleteAuthor = async (req, res) => {
  const { id } = req.params;

  // Get all books written by this author
  const books = await db.any(
    "SELECT book_isbn FROM bookauthor WHERE author_id=$1",
    [id]
  );

  // Delete book-author relations
  await db.none("DELETE FROM bookauthor WHERE author_id=$1", [id]);

  // Delete the books from book table
  for (const book of books) {
    await db.none("DELETE FROM book WHERE isbn=$1", [book.book_isbn]);
  }

  // Delete the author
  await db.none("DELETE FROM author WHERE author_id=$1", [id]);

  res.redirect("/authors");
};