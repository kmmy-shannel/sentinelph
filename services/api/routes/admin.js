const express = require('express');
const { initFirebase } = require('../config/firebase');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const User = require('../models/User');
const { sendActivationEmail } = require('../utils/email');

const router = express.Router();

const REQUIRED_FIELDS = ['email', 'fullName', 'badgeId', 'agency', 'jurisdiction'];

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
 * invitee a single-use activation link.
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
        jurisdiction: jurisdiction,
      });

      const actionCodeSettings = {
  url: process.env.ACTIVATION_REDIRECT_URL || `${process.env.CLIENT_ORIGIN_WEB}/activate`,
  handleCodeInApp: true, // was false — now Firebase deep-links straight to our own page
};

      const activationLink = await admin
        .auth()
        .generatePasswordResetLink(normalizedEmail, actionCodeSettings);

      const newUser = await User.create({
        firebaseUid: firebaseUser.uid,
        email: normalizedEmail,
        fullName,
        role: 'officer',
        badgeId,
        agency,
        jurisdiction,
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

module.exports = router;