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
// POST /api/v1/account/change-password
// body: { currentPassword, newPassword, confirmPassword }
// ══════════════════════════════════════════════════════════════════════
router.post('/change-password', changePwLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

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
      logReject('MISSING_FIELDS', 'One or more fields missing');
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Please fill in all fields.',
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
      logReject('NO_EMAIL', 'Firebase user has no email', { uid });
      return res.status(400).json({
        success: false,
        error: 'NO_EMAIL',
        message: 'Your account has no email on file.',
      });
    }

    const verify = await verifyCurrentPassword(fbUser.email, currentPassword);
    if (!verify.ok) {
      logReject('VERIFY_FAILED', 'Firebase signInWithPassword returned non-OK', {
        firebaseError: verify.firebaseError,
      });
      let errorCode = 'INVALID_CURRENT_PASSWORD';
      let message = 'Current password is incorrect.';
      if (verify.firebaseError === 'USER_DISABLED') {
        errorCode = 'USER_DISABLED';
        message = 'Your Firebase account is disabled. Contact your NBI supervisor.';
      } else if (verify.firebaseError === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        errorCode = 'TOO_MANY_ATTEMPTS';
        message = 'Too many attempts. Please try again in a few minutes.';
      }
      return res.status(400).json({ success: false, error: errorCode, message });
    }

    await admin.auth().updateUser(uid, { password: newPassword });

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