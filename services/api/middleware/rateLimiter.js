// services/api/middleware/rateLimiter.js
'use strict';

const rateLimit = require('express-rate-limit');

function readPositiveInt(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildLimiter({ windowMs, max, code, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: code,
        message,
      }),
  });
}

/**
 * POST /api/v1/reports — citizen report submission.
 * Default: 20 submissions per hour per IP. Override with
 * REPORT_SUBMIT_RATE_LIMIT_PER_HOUR.
 */
const reportSubmissionLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: readPositiveInt('REPORT_SUBMIT_RATE_LIMIT_PER_HOUR', 20),
  code: 'REPORT_SUBMIT_RATE_LIMITED',
  message: 'Too many report submissions. Please try again later.',
});

/**
 * POST /api/v1/reports/analyze — Layer 1 instant AI preview.
 * Each call hits the metered FastAPI / Hugging Face backend.
 * Default: 10 requests per minute per client. Override with
 * AI_ANALYZE_RATE_LIMIT_PER_MIN.
 */
const analyzeLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: readPositiveInt('AI_ANALYZE_RATE_LIMIT_PER_MIN', 10),
  code: 'ANALYZE_RATE_LIMITED',
  message: 'Too many scam-analysis requests. Please wait a minute and try again.',
});

/**
 * POST /api/v1/reports/ocr — screenshot OCR (most expensive AI call).
 * Default: 10 requests per minute per client. Override with
 * AI_OCR_RATE_LIMIT_PER_MIN.
 */
const ocrLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: readPositiveInt('AI_OCR_RATE_LIMIT_PER_MIN', 10),
  code: 'OCR_RATE_LIMITED',
  message: 'Too many screenshot-scan requests. Please wait a minute and try again.',
});

module.exports = {
  reportSubmissionLimiter,
  analyzeLimiter,
  ocrLimiter,
};