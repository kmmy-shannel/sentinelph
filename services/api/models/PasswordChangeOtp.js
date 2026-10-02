// services/api/models/PasswordChangeOtp.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

// OTP codes are single-use, expire in 5 minutes, and are stored hashed.
// Never store the plaintext code — if the DB leaks, the codes are useless.
const PasswordChangeOtpSchema = new Schema(
  {
    firebaseUid: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    // SHA-256 hex of the 6-digit code + server pepper.
    // Not bcrypt — the code is short-lived and low-entropy; a fast hash
    // plus attempt cap is the right tradeoff for UX (no 200ms bcrypt
    // delay on every verification attempt).
    codeHash: { type: String, required: true },

    // Lifecycle
    createdAt: { type: Date, default: Date.now, expires: 300 }, // TTL: 5 minutes
    usedAt: { type: Date, default: null },

    // Brute-force protection
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },

    // Context — recorded for audit
    requestIp: { type: String, default: null },
    requestUserAgent: { type: String, default: null },
  },
  {
    timestamps: false,
    collection: 'password_change_otps',
  }
);

PasswordChangeOtpSchema.index({ firebaseUid: 1, createdAt: -1 });
PasswordChangeOtpSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model('PasswordChangeOtp', PasswordChangeOtpSchema);