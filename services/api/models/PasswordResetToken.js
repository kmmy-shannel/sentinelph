// services/api/models/PasswordResetToken.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Stores password reset attempts for BOTH flows:
 *
 *   • Web / link flow (routes/auth.js /request-password-reset):
 *     writes `tokenHash` + `expiresAt` + `usedAt`.
 *     The emailed link contains a 32-byte random token; only
 *     sha256(token) is stored.
 *
 *   • Mobile / OTP flow (routes/auth.js /request-password-otp):
 *     writes `otpHash` + `otpExpiresAt` + `otpAttempts` + `otpVerifiedAt`
 *     + `resetSessionTokenHash` + `resetSessionExpiresAt` + `resetCompletedAt`.
 *     The 6-digit OTP is emailed; only sha256(otp) is stored.
 *
 * All flow-specific fields are optional so whichever flow writes the
 * document doesn't trip the other flow's `required` validators.
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

    // ─── Web / link flow fields ────────────────────────────────────
    tokenHash: {
      type: String,
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },

    // ─── Mobile / OTP flow fields ──────────────────────────────────
    otpHash: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpVerifiedAt: {
      type: Date,
      default: null,
    },
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

    // ─── Request metadata ──────────────────────────────────────────
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

// TTL indexes for both flows. Sparse so documents missing the other
// flow's expiry field aren't immediately purged. MongoDB runs the TTL
// monitor on the field that exists in each document.
passwordResetTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 300, sparse: true }
);
passwordResetTokenSchema.index(
  { otpExpiresAt: 1 },
  { expireAfterSeconds: 300, sparse: true }
);

const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model('PasswordResetToken', passwordResetTokenSchema);

module.exports = PasswordResetToken;