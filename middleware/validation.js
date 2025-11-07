const Joi = require("joi");

// ---------------- Author Schema ----------------
const authorSchema = Joi.object({
  author: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    url: Joi.string().uri().allow(null, ""),
    address: Joi.string().max(255).allow(null, ""),
  }).required(),
});

// ---------------- Publisher Schema ----------------
const publisherSchema = Joi.object({
  publisher: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    phone: Joi.string()
      .pattern(/^[0-9\-+() ]{7,20}$/)
      .allow(null, ""),
    url: Joi.string().uri().allow(null, ""),
    address: Joi.string().max(255).allow(null, ""),
  }).required(),
});

// ---------------- Book Schema ----------------
const bookSchema = Joi.object({
  book: Joi.object({
    isbn: Joi.string().length(13).required(),
    title: Joi.string().min(2).max(255).required(),
    publication_year: Joi.number()
      .integer()
      .min(1500)
      .max(new Date().getFullYear()),
    price: Joi.number().precision(2).positive().required(),
    author_id: Joi.number().integer().required(),
    publisher_name: Joi.string().required(),
  }).required(),
});

// ---------------- Middleware Functions ----------------
module.exports.validateAuthor = (req, res, next) => {
  const { error } = authorSchema.validate(req.body);
  if (error) {
    const err = new Error(error.details[0].message);
    err.statusCode = 400;
    throw err;
  }
  next();
};

module.exports.validatePublisher = (req, res, next) => {
  const { error } = publisherSchema.validate(req.body);
  if (error) {
    const err = new Error(error.details[0].message);
    err.statusCode = 400;
    throw err;
  }
  next();
};

module.exports.validateBook = (req, res, next) => {
  const { error } = bookSchema.validate(req.body);
  console.log("Body received:", req.body);
  if (error) {
    const err = new Error(error.details[0].message);
    err.statusCode = 400;
    throw err;
  }
  next();
};
