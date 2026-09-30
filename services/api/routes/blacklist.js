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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * For each blacklist entry, attach `evidenceImage` from the most recent
 * report filed against the same number. Only includes the screenshot if
 * it exists — keeps response size reasonable by requesting the field
 * explicitly and only for the entries we're returning.
 *
 * This is a separate step (not a Mongo $lookup) because the screenshot
 * is a base64 data-URI (potentially MBs each) and we don't want to
 * always pay the cost — only when listing.
 */
async function attachEvidenceImages(entries) {
  if (!entries.length) return entries;

  const phoneNumbers = entries.map((e) => e.phoneNumber).filter(Boolean);
  if (!phoneNumbers.length) return entries;

  const reports = await Report.find({ reportedNumber: { $in: phoneNumbers } })
    .select('reportedNumber evidenceImage createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const imageByNumber = new Map();
  for (const r of reports) {
    if (!imageByNumber.has(r.reportedNumber) && r.evidenceImage) {
      imageByNumber.set(r.reportedNumber, r.evidenceImage);
    }
  }

  return entries.map((e) => ({
    ...e,
    evidenceImage: imageByNumber.get(e.phoneNumber) || null,
  }));
}

// =====================================================================
// POST /api/v1/blacklist/candidates — Open (or fetch) a candidate
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
// GET /api/v1/blacklist/public — Citizen-safe public registry
//
// Returns ONLY confirmed blacklisted entries, projected to the fields
// citizens may see:
//   { phoneNumber, status, scamType, reportCount, region, blacklistedAt }
//
// NEVER returns: officer identities, votes, comments, hashes, notes.
//
// Registered BEFORE /:phoneNumber/status so "public" is never treated
// as a phone number.
//
// Query params (all optional):
//   ?q=<text>       filter by phoneNumber or scamType (case-insensitive)
//   ?region=<r>     filter by region (UNCLASSIFIED entries not filtered out)
//   ?limit=100      max rows (default 100, cap 500)
// =====================================================================
router.get(
  '/public',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('citizen', 'officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 100, 1),
      500
    );

    // Only confirmed scam entries are exposed to citizens. Statuses the
    // officer flow uses once a report reaches two approvals:
    //   'blacklisted' (canonical)   'approved' (legacy alias)
    const query = { status: { $in: ['blacklisted', 'approved'] } };

    if (req.query.region) {
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

    const items = await BlacklistEntry.find(query)
      .sort({ blacklistedAt: -1, updatedAt: -1 })
      .limit(limit)
      .select('phoneNumber status scamType reportCount region blacklistedAt')
      .lean();

    // Belt-and-braces projection: even if select() is bypassed, the
    // response only ever carries the public fields.
    const publicItems = items.map((e) => ({
      phoneNumber: e.phoneNumber,
      status: e.status,
      scamType: e.scamType || 'UNKNOWN',
      reportCount: e.reportCount ?? 0,
      region: e.region || UNCLASSIFIED,
      blacklistedAt: e.blacklistedAt || null,
    }));

    return res.status(200).json({
      success: true,
      count: publicItems.length,
      data: publicItems,
    });
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

    if (req.user.role === 'citizen') {
      return res.status(200).json({
        success: true,
        data: {
          phoneNumber: entry.phoneNumber,
          status: entry.status,
          scamType: entry.scamType || null,
          reportCount: entry.reportCount ?? 0,
          region: entry.region || null,
          blacklistedAt: entry.blacklistedAt,
        },
      });
    }

    return res.status(200).json({ success: true, data: entry });
  })
);

// =====================================================================
// GET /api/v1/blacklist — List candidates/entries with filters
//   (Officer, Analyst, Auditor)
//
// Response entries now include:
//   - votes:  [ { officerId, decision, comment, votedAt }, ... ]
//   - evidenceImage: base64 data-URI from the linked Report (or null)
// =====================================================================
router.get(
  '/',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const query = {};

    if (req.query.status) {
      const statuses = String(req.query.status)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length === 1) query.status = statuses[0];
      else if (statuses.length > 1) query.status = { $in: statuses };
    }

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

    const itemsWithEvidence = await attachEvidenceImages(items);

    return res.status(200).json({
      success: true,
      data: itemsWithEvidence,
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