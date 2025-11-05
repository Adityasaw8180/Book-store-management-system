const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync");
const { validateBook } = require("../middleware/validation");
const bookController = require("../controllers/bookController");

// Book routes
router.get("/", wrapAsync(bookController.listBooks));
router.get("/all", wrapAsync(bookController.allBooks));
router.get("/new", wrapAsync(bookController.showNewForm));
router.post("/", validateBook, wrapAsync(bookController.createBook));
router.get("/:isbn/edit", wrapAsync(bookController.showEditForm));
router.put("/:isbn", validateBook, wrapAsync(bookController.updateBook));
router.delete("/delete/:isbn", wrapAsync(bookController.deleteBook));

module.exports = router;
