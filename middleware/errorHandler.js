module.exports.errorHandler = (err, req, res, next) => {
  console.error("Error caught by middleware:", err.message);
  res.status(400).render("error", { err });
};
