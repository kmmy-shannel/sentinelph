// services/api/models/PasswordResetToken.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Stores a single live OTP-based password reset attempt per user.
 *
 * Security model:
 *   • The raw 6-digit OTP is only ever emailed to the user.
 *   • The DB stores sha256(otp + salt) — never the raw OTP.
 *   • Max 5 verification attempts, then the record is locked.
 *   • OTP expires after 10 minutes (TTL index auto-purges).
 *   • After OTP verification succeeds, a random resetSessionToken is
 *     issued and stored as sha256(sessionToken). The client uses that
 *     token in the final reset-password step — the raw OTP is never
 *     used again.
 */
const passwordResetTokenSchema = new Schema(
  {
    firebaseUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // ─── OTP storage ───────────────────────────────────────────────
    otpHash: {
      type: String,
      required: true,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpVerifiedAt: {
      type: Date,
      default: null,
    },

    // ─── Reset session token (issued after OTP verification) ────────
    resetSessionTokenHash: {
      type: String,
      default: null,
      index: true,
    },
    resetSessionExpiresAt: {
      type: Date,
      default: null,
    },
    resetCompletedAt: {
      type: Date,
      default: null,
    },

    // ─── Request metadata ───────────────────────────────────────────
    requestedIp: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// TTL: purge records 5 minutes after the OTP expires, so the collection
// never grows unbounded.
passwordResetTokenSchema.index(
  { otpExpiresAt: 1 },
  { expireAfterSeconds: 300 }
);

const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model('PasswordResetToken', passwordResetTokenSchema);

module.exports = PasswordResetToken;