const db = require("../db");

module.exports.listPublishers = async (req, res) => {
  const publishers = await db.any("SELECT * FROM publisher ORDER BY name");
  res.render("publishers/show", { publishers, activePage: "publishers" });
};

module.exports.renderNewForm = (req, res) => {
  res.render("publishers/new");
};

module.exports.createPublisher = async (req, res) => {
  const { name, address, url, phone } = req.body.publisher;
  await db.none(
    "INSERT INTO publisher (name,address,url,phone) VALUES ($1,$2,$3,$4)",
    [name, address, url, phone]
  );
  res.redirect("/publishers");
};

module.exports.renderEditForm = async (req, res) => {
  const { name } = req.params;
  const publisher = await db.oneOrNone(
    "SELECT * FROM publisher WHERE name=$1",
    [name]
  );
  if (!publisher) throw new Error("Publisher not found");
  res.render("publishers/edit", { publisher });
};

module.exports.updatePublisher = async (req, res) => {
  const { name } = req.params;
  const { new_name, address, phone } = req.body.publisher;

  await db.tx(async (t) => {
    await t.none(
      "UPDATE publisher SET name=$1, address=$2, phone=$3 WHERE name=$4",
      [new_name, address, phone, name]
    );
    if (new_name !== name) {
      await t.none(
        "UPDATE book SET publisher_name=$1 WHERE publisher_name=$2",
        [new_name, name]
      );
    }
  });

  res.redirect("/publishers");
};

module.exports.deletePublisher = async (req, res) => {
  const { name } = req.params;
  const books = await db.any("SELECT isbn FROM book WHERE publisher_name=$1", [
    name,
  ]);
  for (let book of books) {
    await db.none("DELETE FROM bookauthor WHERE book_isbn=$1", [book.isbn]);
  }
  await db.none("DELETE FROM book WHERE publisher_name=$1", [name]);
  await db.none("DELETE FROM publisher WHERE name=$1", [name]);
  res.redirect("/publishers");
};