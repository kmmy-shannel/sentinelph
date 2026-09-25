// services/api/routes/blacklist.js
const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole, enforceAuditorReadOnly } = require('../middleware/rbac');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const BlacklistEntry = require('../models/BlacklistEntry');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

const UNCLASSIFIED = 'UNCLASSIFIED';

// Only these are ever allowed to surface in the Blacklist Registry list view.
// 'rejected' is deliberately excluded — rejected cases are not blacklisted.
const VISIBLE_STATUSES = ['blacklisted'];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =====================================================================
// POST /api/v1/blacklist/candidates — Open (or fetch) a candidate for
// review (Officer, Analyst)
//
// NOTE: a candidate can no longer be voted on directly. It becomes
// 'blacklisted' only when a report filed against the same number reaches
// Two-Officer consensus (POST /api/v1/reports/:reportId/vote).
// =====================================================================
router.post(
  '/candidates',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
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
      region: typeof region === 'string' && region.trim() ? region.trim() : null,
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
// POST /api/v1/blacklist/:phoneNumber/vote — RETIRED (410 Gone)
// =====================================================================
router.post(
  '/:phoneNumber/vote',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer'),
  asyncHandler(async () => {
    throw new ApiError(
      410,
      'Voting on a phone number directly has been retired. Vote on the underlying report via POST /api/v1/reports/:reportId/vote; the number is blacklisted automatically once two officers approve a report.',
      'ENDPOINT_DEPRECATED'
    );
  })
);

// =====================================================================
// GET /api/v1/blacklist/:phoneNumber/status — Public-safe status check
// =====================================================================
router.get(
  '/:phoneNumber/status',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('citizen', 'officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const phoneNumber = String(req.params.phoneNumber);
    const entry = await BlacklistEntry.findOne({ phoneNumber }).lean();

    if (!entry) {
      return res.status(200).json({
        success: true,
        data: { phoneNumber, status: 'not_found', blacklistedAt: null },
      });
    }

    // Citizens only ever see the public-safe shape.
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
// GET /api/v1/blacklist — List entries with filters
// (Officer, Analyst, Auditor)
//
//   ?page=1&limit=20
//   &status=blacklisted      (optional; only 'blacklisted' is ever honored)
//   &q=<text>                (matches number or scam type)
//   &region=<r>              (analyst/auditor only; officers are scoped)
//
// Rejected entries are NEVER returned here — the registry only shows
// numbers that were actually blacklisted.
// =====================================================================
router.get(
  '/',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    // Always constrain to the visible set (currently just 'blacklisted').
    // Incoming ?status= is intersected with VISIBLE_STATUSES, so even if a
    // client asks for 'rejected' it gets nothing rejected back.
    const requestedStatuses = req.query.status
      ? String(req.query.status).split(',').map((s) => s.trim()).filter(Boolean)
      : VISIBLE_STATUSES;

    const statuses = requestedStatuses.filter((s) => VISIBLE_STATUSES.includes(s));

    const query = { status: { $in: statuses.length ? statuses : VISIBLE_STATUSES } };

    // Officers see their own region plus entries with no region / the
    // UNCLASSIFIED sentinel.
    if (req.user.role === 'officer' && req.user.jurisdiction) {
      query.region = { $in: [req.user.jurisdiction, UNCLASSIFIED, null] };
    } else if (req.query.region) {
      query.region = String(req.query.region);
    }

    if (req.query.q) {
      const pattern = escapeRegex(String(req.query.q).trim().slice(0, 60));
      if (pattern) {
        query.$or = [
          { phoneNumber: { $regex: pattern, $options: 'i' } },
          { scamType: { $regex: pattern, $options: 'i' } },
        ];
      }
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