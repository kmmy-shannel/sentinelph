// services/api/routes/account.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyFirebaseToken } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PasswordChangeOtp = require('../models/PasswordChangeOtp');
const { generateOtp, hashCode, safeEqual } = require('../utils/passwordOtp');
const { sendPasswordChangeOtp } = require('../utils/email');

const router = express.Router();

router.use(verifyFirebaseToken);

// ─── Rate limiters ────────────────────────────────────────────────────

// Requesting an OTP: max 5 per 15 min per IP. Also see the per-user
// cooldown inside the handler (60s between sends).
const requestOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many code requests. Please try again later.',
  },
});

// Submitting the change: max 10 per 15 min. Generous enough for a
// typo or two, tight enough to prevent brute force.
const changePwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many password change attempts. Please try again later.',
  },
});

// ─── Constants ────────────────────────────────────────────────────────

const MAX_PW_LENGTH = 64;
const MIN_PW_LENGTH = 8;
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

// Per-user cooldown between OTP sends (in milliseconds).
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

// ─── Shared helpers ───────────────────────────────────────────────────

/**
 * Verify a plaintext password against Firebase by calling the
 * Identity Toolkit REST API. Returns { ok, firebaseError }.
 * The Admin SDK does not expose password verification — only set.
 */
async function verifyCurrentPassword(email, currentPassword) {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) {
    return { ok: false, firebaseError: 'CONFIG_MISSING', httpStatus: 500 };
  }

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: currentPassword,
        returnSecureToken: false,
      }),
    }
  );

  if (resp.ok) return { ok: true, firebaseError: null, httpStatus: resp.status };

  let firebaseError = null;
  try {
    const body = await resp.json();
    firebaseError = body?.error?.message || null;
  } catch {
    /* non-JSON body */
  }
  return { ok: false, firebaseError, httpStatus: resp.status };
}

function validateNewPasswordStrength(pw) {
  if (typeof pw !== 'string') return 'Password must be a string.';
  if (pw.length < MIN_PW_LENGTH)
    return `Password must be at least ${MIN_PW_LENGTH} characters.`;
  if (pw.length > MAX_PW_LENGTH)
    return `Password must not exceed ${MAX_PW_LENGTH} characters.`;
  if (!/[a-zA-Z]/.test(pw)) return 'Password must include at least 1 letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include at least 1 number.';
  if (!SPECIAL_CHAR_RE.test(pw))
    return 'Password must include at least 1 special character (!@#$%^&*).';
  return null;
}

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/account/request-password-change-otp
// body: { currentPassword }
//
// Step 1 of 2. Verifies the current password, then sends a 6-digit code
// to the user's registered email. The code is valid for 5 minutes and
// can only be used once.
// ══════════════════════════════════════════════════════════════════════
router.post('/request-password-change-otp', requestOtpLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Current password is required.',
      });
    }

    const admin = initFirebase();
    const fbUser = await admin.auth().getUser(uid);

    if (!fbUser.email) {
      return res.status(400).json({
        success: false,
        error: 'NO_EMAIL',
        message: 'Your account has no email on file. Contact your administrator.',
      });
    }

    // Verify the current password first — we don't send codes to
    // anyone who can't prove they know the current password.
    const verify = await verifyCurrentPassword(fbUser.email, currentPassword);
    if (!verify.ok) {
      const errorCode =
        verify.firebaseError === 'USER_DISABLED'
          ? 'USER_DISABLED'
          : verify.firebaseError === 'TOO_MANY_ATTEMPTS_TRY_LATER'
          ? 'TOO_MANY_ATTEMPTS'
          : 'INVALID_CURRENT_PASSWORD';
      const message =
        errorCode === 'USER_DISABLED'
          ? 'Your Firebase account is disabled. Contact your supervisor.'
          : errorCode === 'TOO_MANY_ATTEMPTS'
          ? 'Too many attempts. Please try again in a few minutes.'
          : 'Current password is incorrect.';
      console.warn('[account/request-otp] verify failed:', verify.firebaseError);
      return res.status(400).json({ success: false, error: errorCode, message });
    }

    // Cooldown: don't let the user spam-send. Look up the most recent
    // unused OTP for this user.
    const recent = await PasswordChangeOtp.findOne({
      firebaseUid: uid,
      usedAt: null,
    }).sort({ createdAt: -1 });

    if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      const secondsLeft = Math.ceil(
        (OTP_RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000
      );
      return res.status(429).json({
        success: false,
        error: 'OTP_COOLDOWN',
        message: `Please wait ${secondsLeft}s before requesting another code.`,
      });
    }

    // Invalidate any old unused codes for this user so only the newest
    // works. Prevents stale codes from being usable.
    await PasswordChangeOtp.updateMany(
      { firebaseUid: uid, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    // Generate and store the new code
    const code = generateOtp();
    const codeHash = hashCode(code);

    await PasswordChangeOtp.create({
      firebaseUid: uid,
      email: fbUser.email.toLowerCase(),
      codeHash,
      requestIp: req.ip || null,
      requestUserAgent: req.get('user-agent') || null,
    });

    // Send the email. If this fails, delete the OTP row so it can't
    // be used, and return an error.
    try {
      await sendPasswordChangeOtp({
        to: fbUser.email,
        code,
        fullName: fbUser.displayName || 'Officer',
      });
    } catch (mailErr) {
      console.error('[account/request-otp] send failed:', mailErr.message);
      await PasswordChangeOtp.deleteOne({ firebaseUid: uid, codeHash });
      return res.status(500).json({
        success: false,
        error: 'EMAIL_FAILED',
        message: 'Could not send the verification code. Please try again.',
      });
    }

    await AuditLog.record({
      userId: uid,
      role: req.user.role,
      action: 'ACCOUNT_PASSWORD_OTP_REQUESTED',
      ipAddress: req.ip,
      metadata: { email: fbUser.email },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email.',
      // For dev-only convenience — do NOT return this in production.
      // Set SHOW_OTP_IN_RESPONSE=true in dev .env, unset in production.
      ...(process.env.SHOW_OTP_IN_RESPONSE === 'true' ? { _devCode: code } : {}),
    });
  } catch (err) {
    console.error('[account/request-otp] UNCAUGHT:', err);
    return res.status(500).json({
      success: false,
      error: 'REQUEST_FAILED',
      message: 'Could not process your request. Please try again.',
    });
  }
});

// ══════════════════════════════════════════════════════════════════════
// POST /api/v1/account/change-password
// body: { currentPassword, newPassword, confirmPassword, otpCode }
//
// Step 2 of 2. Now REQUIRES a valid otpCode issued by the endpoint above.
// ══════════════════════════════════════════════════════════════════════
router.post('/change-password', changePwLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword, confirmPassword, otpCode } = req.body || {};

    const logReject = (code, message, extra = {}) => {
      console.warn(
        '[account/change-password] rejected:',
        code,
        '|',
        message,
        Object.keys(extra).length ? `| ${JSON.stringify(extra)}` : ''
      );
    };

    // ── Field presence ────────────────────────────────────────────
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string' ||
      typeof otpCode !== 'string' ||
      !currentPassword ||
      !newPassword ||
      !confirmPassword ||
      !otpCode
    ) {
      logReject('MISSING_FIELDS', 'One or more fields missing', {
        hasCurrent: typeof currentPassword === 'string' && currentPassword.length > 0,
        hasNew: typeof newPassword === 'string' && newPassword.length > 0,
        hasConfirm: typeof confirmPassword === 'string' && confirmPassword.length > 0,
        hasOtp: typeof otpCode === 'string' && otpCode.length > 0,
      });
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Please fill in all fields, including the verification code.',
      });
    }

    if (!/^\d{6}$/.test(otpCode)) {
      logReject('INVALID_OTP_FORMAT', 'OTP not 6 digits', {
        length: otpCode.length,
      });
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP',
        message: 'The verification code must be 6 digits.',
      });
    }

    if (newPassword !== confirmPassword) {
      logReject('PASSWORD_MISMATCH', 'New passwords do not match');
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_MISMATCH',
        message: 'New passwords do not match.',
      });
    }

    const strengthError = validateNewPasswordStrength(newPassword);
    if (strengthError) {
      logReject('WEAK_PASSWORD', strengthError);
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: strengthError,
      });
    }

    const admin = initFirebase();
    const fbUser = await admin.auth().getUser(uid);
    if (!fbUser.email) {
      logReject('NO_EMAIL', 'Firebase user has no email');
      return res.status(400).json({
        success: false,
        error: 'NO_EMAIL',
        message: 'Your account has no email on file.',
      });
    }

    // ── Step 2a: Verify the current password (again — defense in depth) ──
    const verify = await verifyCurrentPassword(fbUser.email, currentPassword);
    if (!verify.ok) {
      logReject('VERIFY_FAILED', 'Current password rejected', {
        firebaseError: verify.firebaseError,
      });
      return res.status(400).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    // ── Step 2b: Verify the OTP ──────────────────────────────────
    const record = await PasswordChangeOtp.findOne({
      firebaseUid: uid,
      usedAt: null,
    }).sort({ createdAt: -1 });

    if (!record) {
      logReject('NO_OTP', 'No active OTP for this user');
      return res.status(400).json({
        success: false,
        error: 'OTP_NOT_FOUND',
        message: 'No active verification code. Please request a new one.',
      });
    }

    if (record.attempts >= record.maxAttempts) {
      logReject('OTP_ATTEMPTS_EXCEEDED', 'Too many OTP attempts', {
        attempts: record.attempts,
      });
      return res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'Too many failed attempts. Please request a new code.',
      });
    }

    const submittedHash = hashCode(otpCode);
    if (!safeEqual(submittedHash, record.codeHash)) {
      record.attempts += 1;
      await record.save();
      logReject('OTP_MISMATCH', 'OTP does not match', {
        attempts: record.attempts,
      });
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP',
        message:
          record.attempts >= record.maxAttempts
            ? 'Too many failed attempts. Please request a new code.'
            : `Incorrect code. ${record.maxAttempts - record.attempts} attempt(s) remaining.`,
      });
    }

    // Mark the OTP as used BEFORE updating the password, so a race
    // condition can't reuse it.
    record.usedAt = new Date();
    await record.save();

    // ── Step 2c: Update the password ─────────────────────────────
    await admin.auth().updateUser(uid, { password: newPassword });

    try {
      await User.updateOne({ firebaseUid: uid }, { $set: { updatedAt: new Date() } });
    } catch (dbErr) {
      console.warn('[account/change-password] User.updatedAt bump failed:', dbErr.message);
    }

    await AuditLog.record({
      userId: uid,
      role: req.user.role,
      action: 'ACCOUNT_PASSWORD_CHANGED',
      ipAddress: req.ip,
      metadata: { email: fbUser.email, verifiedByOtp: true },
    }).catch(() => {});

    console.log('[account/change-password] success for uid:', uid);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    console.error('[account/change-password] UNCAUGHT:', err);
    return res.status(500).json({
      success: false,
      error: 'CHANGE_FAILED',
      message: 'Could not update the password. Please try again.',
    });
  }
});

module.exports = router;