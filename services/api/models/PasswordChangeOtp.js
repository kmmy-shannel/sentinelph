// services/api/models/PasswordChangeOtp.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Stores 6-digit OTPs emailed to users as step 1 of the
 * password-change flow. Only sha256(code) is stored — never the
 * plaintext code.
 *
 * Lifecycle:
 *   1. User submits current password   → row created (usedAt: null)
 *   2. User submits code + new password → row marked usedAt = now
 *   3. TTL index purges rows 10 minutes after creation regardless.
 *
 * The route enforces a 5-minute validity window on top of the TTL.
 * The TTL is a safety net so unused rows do not accumulate.
 */
const passwordChangeOtpSchema = new Schema(
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
    },
    codeHash: {
      type: String,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
    requestIp: {
      type: String,
      default: null,
    },
    requestUserAgent: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-purge 10 minutes after creation. The route validates a 5-minute
// TTL on top of this; the extra 5 minutes gives clock-skew margin.
passwordChangeOtpSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 600 }
);

const PasswordChangeOtp =
  mongoose.models.PasswordChangeOtp ||
  mongoose.model('PasswordChangeOtp', passwordChangeOtpSchema);

module.exports = PasswordChangeOtp;