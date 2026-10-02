// services/api/utils/passwordOtp.js
const crypto = require('crypto');

// Server-side pepper — read from env, never hardcoded.
// Add PASSWORD_OTP_PEPPER to services/api/.env
const PEPPER = process.env.PASSWORD_OTP_PEPPER || '';

if (!PEPPER || PEPPER.length < 16) {
  console.warn(
    '[passwordOtp] PASSWORD_OTP_PEPPER is missing or too short. ' +
      'OTP hashing is weak — set a 32+ char random value in .env.'
  );
}

/**
 * Generate a 6-digit numeric code. Uses crypto.randomInt for
 * cryptographically secure randomness.
 */
function generateOtp() {
  // 100000–999999 inclusive. Leading zeros not allowed because we
  // display it as a 6-char string, and a leading zero would look
  // like a 5-digit code to users.
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Hash a code with SHA-256 + server pepper. Deterministic, so we can
 * compare against the stored hash on verification.
 */
function hashCode(code) {
  return crypto
    .createHash('sha256')
    .update(`${PEPPER}:${code}`)
    .digest('hex');
}

/**
 * Timing-safe comparison of two hex strings of the same length.
 * Prevents timing attacks when comparing hashes.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = { generateOtp, hashCode, safeEqual };