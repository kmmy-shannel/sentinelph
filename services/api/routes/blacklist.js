const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const BlacklistEntry = require('../models/BlacklistEntry');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

// =====================================================================
// POST /api/v1/blacklist/candidates — Open (or fetch) a candidate for
// review (Officer, Analyst)
// =====================================================================
router.post(
  '/candidates',
  verifyFirebaseToken,
  requireRole('officer', 'analyst'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, region } = req.body;

    if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length === 0) {
      throw new ApiError(400, 'phoneNumber is required and must be a non-empty string.', 'VALIDATION_ERROR');
    }

    let entry = await BlacklistEntry.findOne({ phoneNumber: phoneNumber.trim() });

    if (entry) {
      return res.status(200).json({
        success: true,
        message: 'Candidate already exists.',
        data: entry,
      });
    }

    const reportCount = await Report.countDocuments({ reportedNumber: phoneNumber.trim() });

    entry = await BlacklistEntry.create({
      phoneNumber: phoneNumber.trim(),
      region: region || null,
      status: 'pending',
      reportCount,
    });

    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'BLACKLIST_CANDIDATE_OPENED',
      ipAddress: req.ip,
      metadata: { phoneNumber: entry.phoneNumber },
    });

    return res.status(201).json({
      success: true,
      message: 'Candidate opened for review.',
      data: entry,
    });
  })
);

// =====================================================================
// POST /api/v1/blacklist/:phoneNumber/vote — Cast Approve/Reject vote
// (Officer only). Approval/rejection is an emergent property of two
// independent officers voting the same way — there is deliberately no
// separate "force approve" endpoint, since that would bypass the
// Two-Officer Consensus guarantee.
// =====================================================================
router.post(
  '/:phoneNumber/vote',
  verifyFirebaseToken,
  requireRole('officer'),
  asyncHandler(async (req, res) => {
    const { decision, comment } = req.body;
    const { phoneNumber } = req.params;

    if (!['approve', 'reject'].includes(decision)) {
      throw new ApiError(400, "decision is required and must be either 'approve' or 'reject'.", 'VALIDATION_ERROR');
    }

    const entry = await BlacklistEntry.findOne({ phoneNumber });

    if (!entry) {
      throw new ApiError(404, `No blacklist candidate found for phoneNumber "${phoneNumber}".`, 'NOT_FOUND');
    }

    if (
      req.user.jurisdiction &&
      entry.region &&
      entry.region !== req.user.jurisdiction
    ) {
      throw new ApiError(403, 'This candidate falls outside your assigned jurisdiction.', 'JURISDICTION_MISMATCH');
    }

    try {
      entry.registerVote(req.user.uid, decision, comment);
    } catch (err) {
      throw new ApiError(err.statusCode || 400, err.message, 'VOTE_REJECTED');
    }

    await entry.save();

    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'BLACKLIST_VOTE_CAST',
      ipAddress: req.ip,
      metadata: {
        phoneNumber: entry.phoneNumber,
        decision,
        resultingStatus: entry.status,
      },
    });

    // If this vote finalized the number as blacklisted, mirror that
    // onto any Report documents already filed against it (workflow
    // status only — never touches the hashed fields).
    if (entry.status === 'blacklisted' || entry.status === 'rejected') {
      await Report.collection.updateMany(
        { reportedNumber: entry.phoneNumber },
        { $set: { status: entry.status } }
      );
    }

    return res.status(200).json({
      success: true,
      message: `Vote recorded. Candidate status: ${entry.status}.`,
      data: entry,
    });
  })
);

// =====================================================================
// GET /api/v1/blacklist/:phoneNumber/status — Public-safe status check
// (any authenticated role, including Citizen for the mobile Search flow)
// =====================================================================
router.get(
  '/:phoneNumber/status',
  verifyFirebaseToken,
  requireRole('citizen', 'officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const entry = await BlacklistEntry.findOne({ phoneNumber: req.params.phoneNumber }).lean();

    if (!entry) {
      return res.status(200).json({
        success: true,
        data: { phoneNumber: req.params.phoneNumber, status: 'not_found', blacklistedAt: null },
      });
    }

    // Citizens only ever see the public-safe shape — no vote details,
    // no officer identities, no comments.
    if (req.user.role === 'citizen') {
      return res.status(200).json({
        success: true,
        data: {
          phoneNumber: entry.phoneNumber,
          status: entry.status,
          blacklistedAt: entry.blacklistedAt,
        },
      });
    }

    return res.status(200).json({ success: true, data: entry });
  })
);

// =====================================================================
// GET /api/v1/blacklist — List candidates/entries with filters
// (Officer, Analyst, Auditor)
// =====================================================================
router.get(
  '/',
  verifyFirebaseToken,
  requireRole('officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const query = {};
    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.user.role === 'officer' && req.user.jurisdiction) {
      query.region = req.user.jurisdiction;
    } else if (req.query.region) {
      query.region = req.query.region;
    }

    const [items, total] = await Promise.all([
      BlacklistEntry.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BlacklistEntry.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  })
);

module.exports = router;