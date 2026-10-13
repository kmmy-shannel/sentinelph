// services/api/routes/account.js
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyFirebaseToken } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PasswordChangeOtp = require('../models/PasswordChangeOtp');
const { sendPasswordChangeOtpEmail } = require('../utils/email');

const router = express.Router();

router.use(verifyFirebaseToken);

// ─── Constants ─────────────────────────────────────────────────────
const MAX_PW_LENGTH = 64;
const MIN_PW_LENGTH = 8;
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

// OTP flow timing
const OTP_TTL_MS = 5 * 60 * 1000;            // code valid for 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;    // 60s between sends
const OTP_MAX_ATTEMPTS = 5;                  // wrong-code lockout

// ─── Rate limiters ────────────────────────────────────────────────
const changePwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many password change attempts. Please try again later.',
  },
});

const requestOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many OTP requests. Please try again later.',
  },
});

// ─── Helpers ──────────────────────────────────────────────────────
function generateOtp() {
  // Cryptographically random 6-digit code, zero-padded.
  // crypto.randomInt(0, 1_000_000) yields 0..999999 inclusive.
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function sendPasswordChangeOtp({ to, code, fullName }) {
  return sendPasswordChangeOtpEmail(
    to,
    fullName,
    code,
    Math.floor(OTP_TTL_MS / 60000)
  );
}

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
  if (/\s/.test(pw)) return 'Password must not contain spaces.';
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

    // Verify the current password first.
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

    // Cooldown check.
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

    // Invalidate any old unused codes for this user so only the newest works.
    await PasswordChangeOtp.updateMany(
      { firebaseUid: uid, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    // Generate and store the new code.
    const code = generateOtp();
    const codeHash = hashCode(code);

    await PasswordChangeOtp.create({
      firebaseUid: uid,
      email: fbUser.email.toLowerCase(),
      codeHash,
      requestIp: req.ip || null,
      requestUserAgent: req.get('user-agent') || null,
    });

    // Send the email. If this fails, delete the OTP row so it can't be used.
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
// Step 2 of 2. Requires a valid otpCode issued by the endpoint above.
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

    // ─── Shape validation ─────────────────────────────────────────
    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      typeof confirmPassword !== 'string' ||
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      logReject('MISSING_FIELDS', 'One or more fields missing', {
        hasCurrent: typeof currentPassword === 'string' && currentPassword.length > 0,
        hasNew: typeof newPassword === 'string' && newPassword.length > 0,
        hasConfirm: typeof confirmPassword === 'string' && confirmPassword.length > 0,
      });
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Please fill in all fields.',
      });
    }

    if (typeof otpCode !== 'string' || !/^\d{6}$/.test(otpCode)) {
      logReject('MISSING_OTP', 'OTP missing or not 6 digits', {
        otpLen: typeof otpCode === 'string' ? otpCode.length : 0,
      });
      return res.status(400).json({
        success: false,
        error: 'MISSING_OTP',
        message: 'Please enter the 6-digit code sent to your email.',
      });
    }

    if (newPassword !== confirmPassword) {
      logReject('PASSWORD_MISMATCH', 'New passwords do not match', {
        newLen: newPassword.length,
        confirmLen: confirmPassword.length,
      });
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_MISMATCH',
        message: 'New passwords do not match.',
      });
    }

    // ─── Password strength ────────────────────────────────────────
    const strengthError = validateNewPasswordStrength(newPassword);
    if (strengthError) {
      logReject('WEAK_PASSWORD', strengthError, {});
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: strengthError,
      });
    }

    // ─── OTP verification ─────────────────────────────────────────
    const otpRow = await PasswordChangeOtp.findOne({
      firebaseUid: uid,
      usedAt: null,
    }).sort({ createdAt: -1 });

    if (!otpRow) {
      logReject('OTP_NOT_FOUND', 'No active OTP for this user', {});
      return res.status(400).json({
        success: false,
        error: 'OTP_NOT_FOUND',
        message: 'No active code found. Please request a new one.',
      });
    }

    // TTL check — belt and braces on top of the Mongo TTL index.
    if (Date.now() - otpRow.createdAt.getTime() > OTP_TTL_MS) {
      logReject('OTP_EXPIRED', 'OTP past TTL', {
        ageMs: Date.now() - otpRow.createdAt.getTime(),
      });
      await PasswordChangeOtp.updateOne(
        { _id: otpRow._id },
        { $set: { usedAt: new Date() } }
      );
      return res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'Your code has expired. Please request a new one.',
      });
    }

    // Attempts lockout
    if ((otpRow.attempts || 0) >= OTP_MAX_ATTEMPTS) {
      logReject('OTP_LOCKED', 'Too many wrong attempts', {
        attempts: otpRow.attempts,
      });
      return res.status(429).json({
        success: false,
        error: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const providedHash = hashCode(otpCode);
    if (providedHash !== otpRow.codeHash) {
      // Increment attempts and reject.
      await PasswordChangeOtp.updateOne(
        { _id: otpRow._id },
        { $inc: { attempts: 1 } }
      );
      const remaining = OTP_MAX_ATTEMPTS - ((otpRow.attempts || 0) + 1);
      logReject('OTP_INCORRECT', 'Code hash mismatch', {
        attempts: (otpRow.attempts || 0) + 1,
      });
      return res.status(400).json({
        success: false,
        error: 'OTP_INCORRECT',
        message:
          remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect code. Please request a new one.',
      });
    }

    // ─── Verify current password against Firebase ────────────────
    const admin = initFirebase();
    const fbUser = await admin.auth().getUser(uid);

    if (!fbUser.email) {
      logReject('NO_EMAIL', 'Firebase user has no email', { uid });
      return res.status(400).json({
        success: false,
        error: 'NO_EMAIL',
        message: 'Your account has no email on file.',
      });
    }

    const verify = await verifyCurrentPassword(fbUser.email, currentPassword);
    if (!verify.ok) {
      logReject('VERIFY_FAILED', 'Current password rejected', {
        firebaseError: verify.firebaseError,
        httpStatus: verify.httpStatus,
      });
      const errorCode =
        verify.firebaseError === 'USER_DISABLED'
          ? 'USER_DISABLED'
          : verify.firebaseError === 'TOO_MANY_ATTEMPTS_TRY_LATER'
          ? 'TOO_MANY_ATTEMPTS'
          : verify.firebaseError === 'EMAIL_NOT_FOUND'
          ? 'EMAIL_NOT_FOUND'
          : 'INVALID_CURRENT_PASSWORD';
      const message =
        errorCode === 'USER_DISABLED'
          ? 'Your Firebase account is disabled. Contact your NBI supervisor.'
          : errorCode === 'TOO_MANY_ATTEMPTS'
          ? 'Too many attempts. Please try again in a few minutes.'
          : errorCode === 'EMAIL_NOT_FOUND'
          ? 'Your sign-in email is not registered. Contact your administrator.'
          : 'Current password is incorrect.';
      return res.status(400).json({ success: false, error: errorCode, message });
    }

    // ─── All checks passed — commit the change ────────────────────
    await admin.auth().updateUser(uid, { password: newPassword });

    // Mark the OTP row as used so it can never be replayed.
    await PasswordChangeOtp.updateOne(
      { _id: otpRow._id },
      { $set: { usedAt: new Date() } }
    );

    // Best-effort: bump Mongo mirror's updatedAt.
    try {
      await User.updateOne(
        { firebaseUid: uid },
        { $set: { updatedAt: new Date() } }
      );
    } catch (dbErr) {
      console.warn(
        '[account/change-password] User.updatedAt bump failed (non-fatal):',
        dbErr.message
      );
    }

    await AuditLog.record({
      userId: uid,
      role: req.user.role,
      action: 'ACCOUNT_PASSWORD_CHANGED',
      ipAddress: req.ip,
      metadata: { email: fbUser.email },
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