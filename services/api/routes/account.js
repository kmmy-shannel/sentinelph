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

/**
 * POST /api/v1/account/change-password
 * body: { currentPassword, newPassword, confirmPassword }
 */
router.post('/change-password', changePwLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Please fill in all fields.',
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'PASSWORD_MISMATCH',
        message: 'New passwords do not match.',
      });
    }
    if (
      newPassword.length < 8 ||
      newPassword.length > 20 ||
      !/[a-zA-Z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)
    ) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message:
          'Password must be 8–20 characters and include a letter, a number, and a special character.',
      });
    }

    const admin = initFirebase();
    const fbUser = await admin.auth().getUser(uid);

    if (!fbUser.email) {
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
      return res.status(400).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    await admin.auth().updateUser(uid, { password: newPassword });

    await AuditLog.record({
      userId: uid,
      role: req.user.role,
      action: 'ACCOUNT_PASSWORD_CHANGED',
      ipAddress: req.ip,
      metadata: { email: fbUser.email },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    console.error('[account/change-password]', err);
    return res.status(500).json({
      success: false,
      error: 'CHANGE_FAILED',
      message: 'Could not update the password. Please try again.',
    });
  }
});

module.exports = router;