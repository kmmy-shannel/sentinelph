// services/api/routes/status.js
const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { verifyFirebaseToken } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/v1/status/summary
router.get(
  '/summary',
  verifyFirebaseToken,
  asyncHandler(async (req, res) => {
    const jurisdiction = req.user?.jurisdiction || req.query.region || null;
    const match = jurisdiction ? { jurisdiction } : {};

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [underReviewCount, confirmedCount, recentCount] = await Promise.all([
      Report.countDocuments({
        ...match,
        status: { $in: ['pending', 'under_review', 'one_approval'] },
      }),
      Report.countDocuments({ ...match, status: 'blacklisted' }),
      Report.countDocuments({
        ...match,
        status: 'blacklisted',
        updatedAt: { $gte: weekAgo },
      }),
    ]);

    const threatLevel =
      recentCount >= 10 ? 'high' : recentCount >= 3 ? 'medium' : 'safe';

    res.json({
      success: true,
      data: {
        threatLevel,
        underReviewCount,
        confirmedCount,
        recentCount,
      },
    });
  })
);

module.exports = router;