/**
 * Centralized error handler. Any middleware/controller that calls
 * next(err) — or throws inside an async handler wrapped with
 * asyncHandler() — lands here. Keeps error response shape consistent
 * across the whole API surface.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.originalUrl} ->`, err);

  const statusCode = err.statusCode && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  const payload = {
    success: false,
    error: err.name || 'INTERNAL_SERVER_ERROR',
    message: err.publicMessage || err.message || 'An unexpected error occurred.',
  };

  if (process.env.NODE_ENV === 'development' && err.stack) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} does not exist.`,
  });
}

/** Wraps an async route handler so thrown errors reach errorHandler(). */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Utility to throw an error carrying an explicit HTTP status code. */
class ApiError extends Error {
  constructor(statusCode, message, name = 'API_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.publicMessage = message;
    this.name = name;
  }
}

module.exports = { errorHandler, notFoundHandler, asyncHandler, ApiError };