const pgp = require("pg-promise")();

const db = pgp({
  host: "localhost", // your DB host
  port: 5432, // default port
  database: "bookstore", // your DB name
  user: "postgres", // your username
  password: "help", // your password
});

module.exports = db;
