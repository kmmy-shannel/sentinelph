// services/api/routes/activation.js
const express = require('express');
const router = express.Router();
const { verifyFirebaseToken } = require('../middleware/auth');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');

router.post('/activate-account', verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid; 
    
    // 1. Get the email from Firebase to use as a fallback
    const admin = initFirebase();
    const fbUser = await admin.auth().getUser(uid);
    const email = fbUser.email;

    console.log(`[activation] Request received for UID: ${uid} / Email: ${email}`);

    // 2. Try finding by firebaseUid
    let updatedUser = await User.findOneAndUpdate(
      { firebaseUid: uid },
      { $set: { status: 'active' } },
      { new: true }
    );

    // 3. Fallback: If not found by UID, find by email and attach the UID
    if (!updatedUser && email) {
      console.log(`[activation] Not found by UID. Trying by email: ${email}`);
      updatedUser = await User.findOneAndUpdate(
        { email: email },
        { $set: { status: 'active', firebaseUid: uid } },
        { new: true }
      );
    }

    if (!updatedUser) {
      console.error(`[activation] FAILED: No user in MongoDB for UID ${uid} or email ${email}`);
      return res.status(404).json({ 
        success: false, 
        message: 'User record not found in database.' 
      });
    }

    console.log(`[activation] SUCCESS: ${updatedUser.email} is now active.`);
    return res.status(200).json({ success: true, user: updatedUser });
    
  } catch (err) {
    console.error('[activation] Database error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error while activating account.' 
    });
  }
});

module.exports = router;