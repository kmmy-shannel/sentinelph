\// services/api/routes/account.js
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

const MAX_PW_LENGTH = 64;
const MIN_PW_LENGTH = 8;
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

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

    await PasswordChangeOtp.updateMany(
      { firebaseUid: uid, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    const code = generateOtp();
    const codeHash = hashCode(code);

    await PasswordChangeOtp.create({
      firebaseUid: uid,
      email: fbUser.email.toLowerCase(),
      codeHash,
      requestIp: req.ip || null,
      requestUserAgent: req.get('user-agent') || null,
    });

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
      logReject('MISSING_FIELDS', 'One or more fields missing');
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Please fill in all fields, including the verification code.',
      });
    }

    if (!/^\d{6}$/.test(otpCode)) {
      logReject('INVALID_OTP_FORMAT', 'OTP not 6 digits');
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

    record.usedAt = new Date();
    await record.save();

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