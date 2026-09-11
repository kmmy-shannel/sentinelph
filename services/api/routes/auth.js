const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user's profile. If the profile is still
 * pending_activation, this first successful authenticated call flips it
 * to active (the "auto-activation on first login" behavior). Suspended
 * accounts are blocked with 403 regardless of a valid token.
 */
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const user = await User.findOne({ firebaseUid });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'PROFILE_NOT_FOUND',
        message: 'No SentinelPH profile exists for this account.',
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended. Contact your administrator.',
      });
    }

    if (user.status === 'pending_activation') {
      user.status = 'active';
      await user.save();
    }

    return res.status(200).json({
      success: true,
      user: user.toSafeJSON(),
    });
  } catch (err) {
    console.error('[auth.me] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'PROFILE_LOOKUP_FAILED',
      message: 'Could not load user profile.',
    });
  }
});

module.exports = router;