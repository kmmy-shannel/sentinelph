const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const { verifyFirebaseToken, verifyFirebaseTokenWithoutRole } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const AuditLog = require('../models/AuditLog');
const { sendPasswordResetEmail, sendPasswordResetOtpEmail } = require('../utils/email');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

/**
 * GET /api/v1/auth/me
 */
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid }).lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'No profile found for this account.',
      });
    }

    return res.json({
      success: true,
      data: {
        firebaseUid: user.firebaseUid,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        badgeId: user.badgeId,
        agency: user.agency,
        jurisdiction: user.jurisdiction,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({
      success: false,
      error: 'PROFILE_FETCH_FAILED',
      message: 'Could not load profile.',
    });
  }
});

/**
 * POST /api/v1/auth/bootstrap-citizen
 */
router.post('/bootstrap-citizen', verifyFirebaseTokenWithoutRole, async (req, res) => {
  try {
    const admin = initFirebase();
    const uid = req.user.uid;

    const firebaseUser = await admin.auth().getUser(uid);
    const currentClaims = firebaseUser.customClaims || {};

    if (currentClaims.role && currentClaims.role !== 'citizen') {
      return res.status(409).json({
        success: false,
        error: 'ROLE_ALREADY_SET',
        message: `This account already has role '${currentClaims.role}'.`,
      });
    }

    await admin.auth().setCustomUserClaims(uid, {
      ...currentClaims,
      role: 'citizen',
    });

    try {
      await User.updateOne(
        { firebaseUid: uid },
        {
          $set: { role: 'citizen' },
          $setOnInsert: { firebaseUid: uid, status: 'active' },
        },
        { upsert: true }
      );
    } catch (dbErr) {
      console.warn('[bootstrap-citizen] User mirror failed (non-fatal):', dbErr.message);
    }

    return res.status(200).json({
      success: true,
      role: 'citizen',
      message: 'Citizen role assigned.',
    });
  } catch (err) {
    console.error('[auth.bootstrap-citizen] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'BOOTSTRAP_FAILED',
      message: 'Could not assign citizen role.',
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// EMAIL EXISTENCE CHECK (used by the Login page)
// ────────────────────────────────────────────────────────────────────

const checkEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many checks. Please try again later.',
  },
});

router.post('/check-email', checkEmailLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'Please enter a valid email address.',
      });
    }

    const user = await User.findOne({ email }).select('email role status').lean();

    if (!user) {
      return res.status(200).json({
        success: true,
        exists: false,
        message: "This email isn't registered in SentinelPH. Contact your administrator.",
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      role: user.role,
      status: user.status,
    });
  } catch (err) {
    console.error('[auth/check-email]', err);
    return res.status(500).json({
      success: false,
      error: 'CHECK_FAILED',
      message: 'Could not verify the email. Please try again.',
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// PASSWORD RESET — request
// ────────────────────────────────────────────────────────────────────

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  },
});

const RESET_TOKEN_TTL_MINUTES = 15;

router.post(
  '/request-password-reset',
  passwordResetLimiter,
  [
    body('email').optional().isString().trim().isLength({ max: 254 }),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    const okResponse = {
      success: true,
      message:
        'If an account exists for that email, a password reset link has been sent.',
    };

    if (!email || !email.includes('@')) {
      return res.status(200).json(okResponse);
    }

    const admin = initFirebase();

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        await AuditLog.record({
          userId: 'anonymous',
          role: 'system',
          action: 'PASSWORD_RESET_REQUESTED_UNKNOWN_EMAIL',
          ipAddress: req.ip,
          metadata: { email },
        }).catch(() => {});
        return res.status(200).json(okResponse);
      }
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000
    );

    await PasswordResetToken.updateMany(
      { firebaseUid: firebaseUser.uid, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    await PasswordResetToken.create({
      firebaseUid: firebaseUser.uid,
      email,
      tokenHash,
      expiresAt,
      requestedIp: req.ip || null,
      userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    });

    const webOrigin =
      process.env.PASSWORD_RESET_WEB_ORIGIN ||
      process.env.CLIENT_ORIGIN_WEB ||
      'http://localhost:5173';
    const resetLink = `${webOrigin.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(
        email,
        firebaseUser.displayName || '',
        resetLink,
        RESET_TOKEN_TTL_MINUTES
      );
    } catch (mailErr) {
      console.error('[auth.request-password-reset] Email send failed:', mailErr);
    }

    await AuditLog.record({
      userId: firebaseUser.uid,
      role: 'system',
      action: 'PASSWORD_RESET_REQUESTED',
      ipAddress: req.ip,
      metadata: { email },
    }).catch(() => {});

    return res.status(200).json(okResponse);
  } catch (err) {
    console.error('[auth.request-password-reset] Unexpected error:', err);
    return res.status(200).json({
      success: true,
      message:
        'If an account exists for that email, a password reset link has been sent.',
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// PASSWORD RESET — confirm
// ────────────────────────────────────────────────────────────────────

function isStrongPassword(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < 8) return false;
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  return hasLetter && hasNumber;
}

router.post(
  '/confirm-password-reset',
  [
    body('token')
      .isString()
      .trim()
      .isLength({ min: 32, max: 128 })
      .withMessage('Invalid reset token'),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 64 })
      .withMessage('Password must be 8–64 characters')
      .matches(/[A-Za-z]/)
      .withMessage('Password must contain a letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain a number'),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || typeof token !== 'string' || token.length < 32) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has expired.',
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message:
          'Password must be at least 8 characters and include a letter and a number.',
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const record = await PasswordResetToken.findOne({ tokenHash });

    if (!record || record.usedAt) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'This reset link is invalid or has already been used.',
      });
    }

    if (record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'This reset link has expired. Please request a new one.',
      });
    }

    const admin = initFirebase();
    await admin.auth().updateUser(record.firebaseUid, {
      password: newPassword,
    });

    record.usedAt = new Date();
    await record.save();

    await AuditLog.record({
      userId: record.firebaseUid,
      role: 'system',
      action: 'PASSWORD_RESET_COMPLETED',
      ipAddress: req.ip,
      metadata: { email: record.email },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Password updated. You can now sign in with your new password.',
    });
  } catch (err) {
    console.error('[auth.confirm-password-reset] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'RESET_FAILED',
      message: 'Could not reset the password. Please request a new link.',
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// OTP-BASED PASSWORD RESET
// ────────────────────────────────────────────────────────────────────

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const RESET_SESSION_TTL_MINUTES = 10;

function generateNumericOtp(length) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += crypto.randomInt(0, 10).toString();
  }
  return code;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const passwordOtpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many password reset requests. Please try again later.',
  },
});

const passwordOtpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many attempts. Please wait before trying again.',
  },
});

router.post(
  '/request-password-otp',
  passwordOtpRequestLimiter,
  [
    body('email').optional().isString().trim().isLength({ max: 254 }),
  ],
  handleValidationErrors,
  async (req, res) => {
  const genericResponse = {
    success: true,
    message: 'If an account exists for that email, a reset code has been sent.',
  };

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      return res.status(200).json(genericResponse);
    }

    const admin = initFirebase();

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        await AuditLog.record({
          userId: 'anonymous',
          role: 'system',
          action: 'PASSWORD_RESET_OTP_REQUESTED_UNKNOWN_EMAIL',
          ipAddress: req.ip,
          metadata: { email },
        }).catch(() => {});
        return res.status(200).json(genericResponse);
      }
      throw err;
    }

    const otp = generateNumericOtp(OTP_LENGTH);
    const otpHash = sha256(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await PasswordResetToken.deleteMany({ firebaseUid: firebaseUser.uid });

    await PasswordResetToken.create({
      firebaseUid: firebaseUser.uid,
      email,
      otpHash,
      otpExpiresAt,
      otpAttempts: 0,
      requestedIp: req.ip || null,
      userAgent: (req.headers['user-agent'] || '').slice(0, 200),
    });

    try {
      await sendPasswordResetOtpEmail(
        email,
        firebaseUser.displayName || '',
        otp,
        OTP_TTL_MINUTES
      );
    } catch (mailErr) {
      console.error('[auth.request-password-otp] Email send failed:', mailErr);
    }

    await AuditLog.record({
      userId: firebaseUser.uid,
      role: 'system',
      action: 'PASSWORD_RESET_OTP_REQUESTED',
      ipAddress: req.ip,
      metadata: { email },
    }).catch(() => {});

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error('[auth.request-password-otp] Unexpected error:', err);
    return res.status(200).json(genericResponse);
  }
});

router.post(
  '/verify-password-otp',
  passwordOtpVerifyLimiter,
  [
    body('email')
      .isEmail()
      .withMessage('A valid email is required')
      .normalizeEmail(),
    body('otp')
      .isString()
      .trim()
      .isLength({ min: 4, max: 8 })
      .withMessage('Please enter the code')
      .matches(/^\d+$/)
      .withMessage('Code must be digits only'),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const otp = String(req.body?.otp || '').trim();

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_EMAIL',
        message: 'A valid email is required.',
      });
    }
    if (!otp || otp.length !== OTP_LENGTH || !/^\d+$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OTP_FORMAT',
        message: `Please enter the ${OTP_LENGTH}-digit code.`,
      });
    }

    const record = await PasswordResetToken.findOne({ email }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'OTP_NOT_FOUND',
        message: 'No reset request found for this email. Please start again.',
      });
    }

    if (record.otpExpiresAt.getTime() < Date.now()) {
      await PasswordResetToken.deleteOne({ _id: record._id }).catch(() => {});
      return res.status(400).json({
        success: false,
        error: 'OTP_EXPIRED',
        message: 'This code has expired. Please request a new one.',
      });
    }

    if (record.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return res.status(400).json({
        success: false,
        error: 'OTP_LOCKED',
        message: 'Too many incorrect attempts. Please request a new code.',
      });
    }

    const submittedHash = sha256(otp);
    if (submittedHash !== record.otpHash) {
      record.otpAttempts += 1;
      await record.save();
      return res.status(400).json({
        success: false,
        error: 'OTP_INCORRECT',
        message: `Incorrect code. ${Math.max(
          0,
          MAX_OTP_ATTEMPTS - record.otpAttempts
        )} attempt(s) remaining.`,
      });
    }

    const resetSessionToken = crypto.randomBytes(32).toString('hex');
    record.resetSessionTokenHash = sha256(resetSessionToken);
    record.resetSessionExpiresAt = new Date(
      Date.now() + RESET_SESSION_TTL_MINUTES * 60 * 1000
    );
    record.otpVerifiedAt = new Date();
    await record.save();

    await AuditLog.record({
      userId: record.firebaseUid,
      role: 'system',
      action: 'PASSWORD_RESET_OTP_VERIFIED',
      ipAddress: req.ip,
      metadata: { email },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Code verified. You can now set a new password.',
      resetSessionToken,
    });
  } catch (err) {
    console.error('[auth.verify-password-otp] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'VERIFY_FAILED',
      message: 'Could not verify the code. Please try again.',
    });
  }
});

router.post(
  '/reset-password-with-otp',
  [
    body('resetSessionToken')
      .isString()
      .trim()
      .isLength({ min: 32, max: 128 })
      .withMessage('Invalid reset session'),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be 8–128 characters')
      .matches(/[A-Za-z]/)
      .withMessage('Password must contain a letter')
      .matches(/[0-9]/)
      .withMessage('Password must contain a number'),
  ],
  handleValidationErrors,
  async (req, res) => {
  try {
    const { resetSessionToken, newPassword } = req.body || {};

    if (!resetSessionToken || typeof resetSessionToken !== 'string' || resetSessionToken.length < 32) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Your reset session is invalid. Please start again.',
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message:
          'Password must be at least 8 characters and include a letter and a number.',
      });
    }

    const tokenHash = sha256(resetSessionToken);
    const record = await PasswordResetToken.findOne({
      resetSessionTokenHash: tokenHash,
    });

    if (!record || !record.otpVerifiedAt) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_SESSION',
        message: 'Your reset session is invalid. Please start again.',
      });
    }

    if (record.resetCompletedAt) {
      return res.status(400).json({
        success: false,
        error: 'SESSION_USED',
        message: 'This reset session has already been used. Please start again.',
      });
    }

    if (
      !record.resetSessionExpiresAt ||
      record.resetSessionExpiresAt.getTime() < Date.now()
    ) {
      await PasswordResetToken.deleteOne({ _id: record._id }).catch(() => {});
      return res.status(400).json({
        success: false,
        error: 'SESSION_EXPIRED',
        message: 'Your reset session has expired. Please request a new code.',
      });
    }

    const admin = initFirebase();
    await admin.auth().updateUser(record.firebaseUid, { password: newPassword });

    record.resetCompletedAt = new Date();
    await record.save();

    await AuditLog.record({
      userId: record.firebaseUid,
      role: 'system',
      action: 'PASSWORD_RESET_COMPLETED_VIA_OTP',
      ipAddress: req.ip,
      metadata: { email: record.email },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Password updated. You can now sign in with your new password.',
    });
  } catch (err) {
    console.error('[auth.reset-password-with-otp] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'RESET_FAILED',
      message: 'Could not reset the password. Please request a new code.',
    });
  }
});

module.exports = router;