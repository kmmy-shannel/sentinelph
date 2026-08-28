const rateLimit = require('express-rate-limit');

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const max = Number(process.env.RATE_LIMIT_MAX) || 300;

// Global limiter applied to every route
const globalLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests from this IP. Please try again later.',
  },
  keyGenerator: (req) => req.ip,
});

// Stricter limiter specifically for report submission, to blunt spam/DoS
// against the hash-chain append path without punishing normal browsing.
const reportSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many report submissions. Please wait before submitting again.',
  },
});

module.exports = { globalLimiter, reportSubmissionLimiter };