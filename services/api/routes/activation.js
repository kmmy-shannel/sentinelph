const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

/**
 * POST /api/v1/auth/activate-account
 * Called by the client immediately after confirmPasswordReset() + a fresh
 * sign-in succeed. Flips the officer's Mongo profile from
 * pending_activation -> active. Requires a valid Firebase ID token, so it
 * can only be called by the account owner themselves.
 */
router.post('/activate-account', verifyFirebaseToken, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;

    const user = await User.findOne({ firebaseUid });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'No matching profile was found for this account.',
      });
    }

    if (user.status === 'active') {
      // Already activated — idempotent, not an error.
      return res.status(200).json({ success: true, message: 'Account already active.', user: user.toSafeJSON() });
    }

    user.status = 'active';
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account activated successfully.',
      user: user.toSafeJSON(),
    });
  } catch (err) {
    console.error('[auth.activate-account] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'ACTIVATION_FAILED',
      message: 'Failed to activate the account.',
    });
  }
});

module.exports = router;