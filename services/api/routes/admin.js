// services/api/routes/admin.js
const express = require('express');
const crypto = require('crypto');
const { initFirebase } = require('../config/firebase');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendActivationEmail } = require('../utils/email');
const { PH_REGIONS, isValidRegion } = require('../../../shared/regions');

const router = express.Router();

const REQUIRED_FIELDS = ['email', 'fullName', 'badgeId', 'agency', 'jurisdiction'];

// Invite activation links expire in 15 minutes, same as web forgot-password.
const ACTIVATION_TOKEN_TTL_MINUTES = 15;

function getAllowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function isDomainAllowed(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;

  // Always allow any subdomain of .gov.ph (e.g. pnp.gov.ph, ndrrmc.gov.ph)
  if (domain.endsWith('.gov.ph') || domain === 'gov.ph') {
    return true;
  }

  const allowedDomains = getAllowedDomains();
  return allowedDomains.includes(domain);
}

/**
 * POST /api/v1/admin/invite-officer
 * Restricted to admin / superadmin. Provisions a passwordless Firebase
 * account, saves a pending_activation profile in MongoDB, and emails the
 * invitee a single-use activation link pointing at our own ResetPassword
 * page with ?mode=activate.
 *
 * Uses the same custom-token system as /auth/request-password-reset so
 * the frontend's confirm-password-reset handler needs no changes.
 */
router.post(
  '/invite-officer',
  verifyFirebaseToken,
  requireRole('admin', 'superadmin'),
  async (req, res) => {
    try {
      const { email, fullName, badgeId, agency, jurisdiction } = req.body || {};

      const missing = REQUIRED_FIELDS.filter((field) => !req.body?.[field] || !String(req.body[field]).trim());
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Missing required field(s): ${missing.join(', ')}.`,
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();

      // Region whitelist — must be one of the canonical Roman-numeral
      // names in shared/regions.js.
      const normalizedJurisdiction = String(jurisdiction).trim();
      if (!isValidRegion(normalizedJurisdiction)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_JURISDICTION',
          message: `jurisdiction must be one of: ${PH_REGIONS.join(', ')}.`,
        });
      }

      if (!isDomainAllowed(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          error: 'DOMAIN_NOT_ALLOWED',
          message: 'The email domain is not an approved .gov.ph domain or whitelisted domain.',
        });
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'USER_EXISTS',
          message: 'A user profile with this email already exists.',
        });
      }

      const admin = initFirebase();

      // Fetch or create the Firebase Auth account.
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUserByEmail(normalizedEmail);
      } catch (lookupErr) {
        if (lookupErr.code !== 'auth/user-not-found') {
          throw lookupErr;
        }
        firebaseUser = await admin.auth().createUser({
          email: normalizedEmail,
          displayName: fullName,
          emailVerified: true,
        });
      }

      // Tag the new officer with a role claim so verifyFirebaseToken
      // recognizes them once they authenticate.
      await admin.auth().setCustomUserClaims(firebaseUser.uid, {
        role: 'officer',
        jurisdiction: normalizedJurisdiction,
      });

      // ─── Build a custom activation link (NOT a Firebase link) ────────
      // Same token mechanics as /auth/request-password-reset:
      //   • 32-byte random token emailed to the officer
      //   • sha256(token) stored in PasswordResetToken
      //   • confirm-password-reset verifies the hash and updates the
      //     Firebase password — no changes needed on that endpoint.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const expiresAt = new Date(
        Date.now() + ACTIVATION_TOKEN_TTL_MINUTES * 60 * 1000
      );

      // One live token per user — clear any stale invite/reset tokens.
      await PasswordResetToken.deleteMany({ firebaseUid: firebaseUser.uid });

      await PasswordResetToken.create({
        firebaseUid: firebaseUser.uid,
        email: normalizedEmail,
        tokenHash,
        expiresAt,
        requestedIp: req.ip || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
      });

      const webOrigin =
        process.env.CLIENT_ORIGIN_WEB ||
        process.env.PASSWORD_RESET_WEB_ORIGIN ||
        'http://localhost:5173';

      const activationLink = `${webOrigin.replace(/\/$/, '')}/reset-password?mode=activate&token=${rawToken}`;
      // ─────────────────────────────────────────────────────────────────

      const newUser = await User.create({
        firebaseUid: firebaseUser.uid,
        email: normalizedEmail,
        fullName,
        role: 'officer',
        badgeId,
        agency,
        jurisdiction: normalizedJurisdiction,
        status: 'pending_activation',
      });

      try {
        await sendActivationEmail(normalizedEmail, fullName, agency, activationLink);
      } catch (mailErr) {
        console.error('[admin.invite-officer] Activation email failed to send:', mailErr);
        return res.status(201).json({
          success: true,
          warning: 'USER_CREATED_EMAIL_FAILED',
          message: 'User was provisioned, but the activation email could not be sent. Share the link manually.',
          activationLink,
          user: newUser.toSafeJSON(),
        });
      }

      return res.status(201).json({
        success: true,
        message: `Activation email sent to ${normalizedEmail}.`,
        user: newUser.toSafeJSON(),
      });
    } catch (err) {
      console.error('[admin.invite-officer] Unexpected error:', err);

      if (err.code === 'auth/email-already-exists') {
        return res.status(409).json({
          success: false,
          error: 'FIREBASE_USER_EXISTS',
          message: 'A Firebase account with this email already exists.',
        });
      }

      return res.status(500).json({
        success: false,
        error: 'INVITE_FAILED',
        message: 'Failed to provision the new officer account.',
      });
    }
  }
);

/**
 * GET /api/v1/admin/officers
 * Lists all officer-role users (across every region), sorted newest first.
 * Restricted to admin/superadmin.
 */
router.get(
  '/officers',
  verifyFirebaseToken,
  requireRole('admin', 'superadmin'),
  async (req, res) => {
    try {
      const officers = await User.find({ role: 'officer' })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();

      return res.status(200).json({
        success: true,
        officers: officers.map((o) => ({
          _id: o._id,
          firebaseUid: o.firebaseUid,
          email: o.email,
          fullName: o.fullName,
          role: o.role,
          badgeId: o.badgeId,
          agency: o.agency,
          jurisdiction: o.jurisdiction,
          status: o.status,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
        })),
      });
    } catch (err) {
      console.error('[admin.officers] Unexpected error:', err);
      return res.status(500).json({
        success: false,
        error: 'LIST_FAILED',
        message: 'Failed to list officers.',
      });
    }
  }
);

module.exports = router;