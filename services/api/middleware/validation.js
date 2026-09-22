// services/api/middleware/validation.js
// Centralized validation error handler.
// Use this after any chain of express-validator checks.

const { validationResult } = require('express-validator');

/**
 * Terminates the request with 400 if express-validator found issues.
 * Passes through if the request body/params/query are all valid.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  // Return the first error with a consistent shape that matches
  // the rest of the API (see middleware/errorHandler.js).
  const first = errors.array()[0];
  return res.status(400).json({
    success: false,
    error: 'VALIDATION_ERROR',
    message: first.msg,
    field: first.path,
  });
}

module.exports = { handleValidationErrors };