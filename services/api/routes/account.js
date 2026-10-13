// services/api/routes/account.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { verifyFirebaseToken } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

router.use(verifyFirebaseToken);

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

// Maximum password length. Must match the frontend cap in
// apps/web/src/pages/*/Account.jsx (MAX_PW_LENGTH = 64) or the client
// will allow a password the server rejects.
const MAX_PW_LENGTH = 64;
const MIN_PW_LENGTH = 8;

// Same special-character class the frontend uses. Kept as a constant
// so both sides agree on what counts as "special".
const SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

/**
 * POST /api/v1/account/change-password
 * body: { currentPassword, newPassword, confirmPassword }
 *
 * Flow:
 *   1. Validate the input shape and password strength.
 *   2. Fetch the Firebase user for this uid.
 *   3. Verify the CURRENT password by calling Firebase's Identity Toolkit
 *      REST signInWithPassword endpoint (the Admin SDK has no password
 *      verification method — only set/update).
 *   4. Update the password via the Admin SDK.
 *   5. Record an audit entry.
 *
 * Requires FIREBASE_API_KEY in the environment — the Firebase Web API
 * key, same value as the client's VITE_FIREBASE_API_KEY. Missing key
 * returns a structured 500 CONFIG_ERROR the frontend can show.
 */
<<<<<<< Updated upstream
=======
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

  // Reject whitespace outright. Spaces look like characters but never
  // contribute meaningful entropy, and a password of only spaces
  // collapses to nothing.
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
>>>>>>> Stashed changes
router.post('/change-password', changePwLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    // ─── Structured logging: every rejection prints the reason so the
    //     Express terminal tells you exactly which check failed. ────────
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

    // Password strength — mirror the frontend rules EXACTLY so a
    // password the client accepts can never be rejected here for a
    // reason the user already fixed on their side.
    if (newPassword.length < MIN_PW_LENGTH) {
      logReject('WEAK_PASSWORD', 'Too short', { length: newPassword.length });
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: `Password must be at least ${MIN_PW_LENGTH} characters.`,
      });
    }
    if (newPassword.length > MAX_PW_LENGTH) {
      logReject('WEAK_PASSWORD', 'Too long', { length: newPassword.length });
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: `Password must not exceed ${MAX_PW_LENGTH} characters.`,
      });
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      logReject('WEAK_PASSWORD', 'No letter', {});
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password must include at least 1 letter.',
      });
    }
    if (!/[0-9]/.test(newPassword)) {
      logReject('WEAK_PASSWORD', 'No number', {});
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: 'Password must include at least 1 number.',
      });
    }
    if (!SPECIAL_CHAR_RE.test(newPassword)) {
      logReject('WEAK_PASSWORD', 'No special character', {});
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message:
          'Password must include at least 1 special character (!@#$%^&*).',
      });
    }

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

    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      console.error('[account] FIREBASE_API_KEY is not set in .env');
      return res.status(500).json({
        success: false,
        error: 'CONFIG_ERROR',
        message: 'Password change is not configured. Contact your administrator.',
      });
    }

    const verifyResp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fbUser.email,
          password: currentPassword,
          returnSecureToken: false,
        }),
      }
    );

    if (!verifyResp.ok) {
      // Firebase returns a JSON body with a specific error code. Surface
      // it so the officer knows whether the password is wrong, the
      // account is disabled, or something else is going on — instead of
      // collapsing all failures into "incorrect password".
      let firebaseError = null;
      try {
        const errBody = await verifyResp.json();
        firebaseError = errBody?.error?.message || null;
      } catch {
        // Non-JSON body — leave null.
      }

      logReject(
        'VERIFY_FAILED',
        'Firebase signInWithPassword returned non-OK',
        {
          firebaseError,
          httpStatus: verifyResp.status,
        }
      );

      let errorCode = 'INVALID_CURRENT_PASSWORD';
      let message = 'Current password is incorrect.';

      if (firebaseError === 'EMAIL_NOT_FOUND') {
        errorCode = 'EMAIL_NOT_FOUND';
        message =
          'Your sign-in email is not registered with Firebase. Contact your administrator.';
      } else if (firebaseError === 'USER_DISABLED') {
        errorCode = 'USER_DISABLED';
        message =
          'Your Firebase account is disabled. Contact your NBI supervisor to restore access.';
      } else if (firebaseError === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        errorCode = 'TOO_MANY_ATTEMPTS';
        message = 'Too many attempts. Please try again in a few minutes.';
      } else if (firebaseError === 'INVALID_LOGIN_CREDENTIALS') {
        // Firebase collapsed the reason — treat as wrong password.
        errorCode = 'INVALID_CURRENT_PASSWORD';
        message = 'Current password is incorrect.';
      } else if (!firebaseError) {
        // Unexpected: 4xx/5xx from Firebase with no JSON body.
        errorCode = 'VERIFY_FAILED';
        message =
          'Could not verify your current password right now. Please try again shortly.';
      }

      return res.status(400).json({
        success: false,
        error: errorCode,
        message,
      });
    }

    await admin.auth().updateUser(uid, { password: newPassword });

    // Bump the Mongo mirror's updatedAt so the Account page's
    // "Last Updated" field reflects the change. Best-effort — a
    // failure here must not fail the password change.
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