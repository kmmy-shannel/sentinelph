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

async function attachReportDerivedFields(entries) {
  if (!entries.length) return entries;

  const phoneNumbers = entries.map((e) => e.phoneNumber).filter(Boolean);
  if (!phoneNumbers.length) return entries;

  const reports = await Report.find({ reportedNumber: { $in: phoneNumbers } })
    .select('reportedNumber evidenceImage createdAt aiFlag')
    .sort({ createdAt: -1 })
    .lean();

  const byNumber = new Map();
  for (const r of reports) {
    if (!byNumber.has(r.reportedNumber)) {
      byNumber.set(r.reportedNumber, r);
    }
  }

  return entries.map((e) => {
    const source = byNumber.get(e.phoneNumber);
    const ai = source?.aiFlag || {};

    return {
      ...e,
      evidenceImage: source?.evidenceImage || null,
      aiLabel:       e.aiLabel       || ai.label       || null,
      aiSubtype:     e.aiSubtype     || ai.subtype     || null,
      aiRiskLevel:   e.aiRiskLevel   || ai.riskLevel   || null,
      aiConfidence:
        e.aiConfidence != null
          ? e.aiConfidence
          : (typeof ai.confidenceScore === 'number' ? ai.confidenceScore : null),
    };
  });
}

// =====================================================================
// POST /api/v1/blacklist/candidates
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
// Query params:
//   ?limit=<n>            default 100, max 500
//   ?kind=number|brand    optional filter; default both
//   ?region=<r>           optional region filter
//   ?q=<text>             optional search across phoneNumber, brandName,
//                         and aiSubtype
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

    const query = { status: { $in: ['blacklisted', 'approved'] } };

    if (req.query.kind === 'number' || req.query.kind === 'brand') {
      query.targetKind = req.query.kind;
    }

    if (req.query.region) {
      query.region = String(req.query.region);
    }

    if (req.query.q) {
      const pattern = escapeRegex(String(req.query.q).trim().slice(0, 60));
      if (pattern) {
        query.$or = [
          { phoneNumber: { $regex: pattern, $options: 'i' } },
          { brandName: { $regex: pattern, $options: 'i' } },
          { aiSubtype: { $regex: pattern, $options: 'i' } },
        ];
      }
    }

    const items = await BlacklistEntry.find(query)
      .sort({ blacklistedAt: -1, updatedAt: -1 })
      .limit(limit)
      .select('phoneNumber status targetKind brandName aiLabel aiSubtype aiRiskLevel reportCount region blacklistedAt')
      .lean();

    const publicItems = items.map((e) => ({
      phoneNumber: e.phoneNumber,
      status: e.status,
      targetKind: e.targetKind || 'number',
      brandName: e.brandName || null,
      aiLabel: e.aiLabel || null,
      aiSubtype: e.aiSubtype || null,
      aiRiskLevel: e.aiRiskLevel || null,
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
          targetKind: entry.targetKind || 'number',
          brandName: entry.brandName || null,
          aiLabel: entry.aiLabel || null,
          aiSubtype: entry.aiSubtype || null,
          aiRiskLevel: entry.aiRiskLevel || null,
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
// GET /api/v1/blacklist/:phoneNumber/detail — Citizen-facing detail
//
// Returns everything a citizen needs to understand WHY this target is
// flagged: the AI verdict (with explanation reasons), the officer
// verdict (with any subtype correction), the report count, region, and
// blacklisted-at timestamp.
//
// Never returns officer IDs, reporter identity, or any PII.
// =====================================================================
router.get(
  '/:phoneNumber/detail',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('citizen', 'officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const phoneNumber = String(req.params.phoneNumber);
    const entry = await BlacklistEntry.findOne({ phoneNumber }).lean();

    if (!entry) {
      throw new ApiError(
        404,
        `No blacklist entry found for "${phoneNumber}".`,
        'NOT_FOUND'
      );
    }

    // Newest report against this target carries the freshest AI verdict
    // and the freshest officer subtype correction.
    const sourceReport = await Report.findOne({ reportedNumber: phoneNumber })
      .sort({ createdAt: -1 })
      .select(
        'aiFlag officerSubtype officerSubtypeAction officerDecision ' +
          'officerVerifiedAt officerSubtypeAggregated officerSubtypeAgreement ' +
          'createdAt'
      )
      .lean();

    const ai = sourceReport?.aiFlag || {};
    const aiFlag = {
      available: ai.available !== false,
      label: ai.label || entry.aiLabel || null,
      subtype: ai.subtype || entry.aiSubtype || null,
      subtypeConfidence:
        typeof ai.subtypeConfidence === 'number' ? ai.subtypeConfidence : null,
      subtypeModelVersion: ai.subtypeModelVersion || null,
      riskLevel: ai.riskLevel || entry.aiRiskLevel || 'UNKNOWN',
      confidenceScore:
        typeof ai.confidenceScore === 'number'
          ? ai.confidenceScore
          : typeof entry.aiConfidence === 'number'
          ? entry.aiConfidence
          : null,
      isScam: ai.isScam ?? null,
      explanationReasons: Array.isArray(ai.explanationReasons)
        ? ai.explanationReasons
        : [],
    };

    return res.status(200).json({
      success: true,
      data: {
        phoneNumber: entry.phoneNumber,
        status: entry.status,
        targetKind: entry.targetKind || 'number',
        brandName: entry.brandName || null,
        region: entry.region || UNCLASSIFIED,
        reportCount: entry.reportCount ?? 0,
        blacklistedAt: entry.blacklistedAt || null,
        aiFlag,
        officerVerdict: sourceReport
          ? {
              verifiedAt: sourceReport.officerVerifiedAt || null,
              subtype: sourceReport.officerSubtype || null,
              subtypeAction: sourceReport.officerSubtypeAction || null,
              decision: sourceReport.officerDecision || null,
              aggregatedSubtype:
                sourceReport.officerSubtypeAggregated || null,
              agreement:
                typeof sourceReport.officerSubtypeAgreement === 'number'
                  ? sourceReport.officerSubtypeAgreement
                  : 0,
            }
          : null,
      },
    });
  })
);

// =====================================================================
// GET /api/v1/blacklist — List candidates/entries with filters
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

    if (req.query.kind === 'number' || req.query.kind === 'brand') {
      query.targetKind = req.query.kind;
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
          { brandName: { $regex: pattern, $options: 'i' } },
          { aiSubtype: { $regex: pattern, $options: 'i' } },
          { aiLabel: { $regex: pattern, $options: 'i' } },
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

    const enriched = await attachReportDerivedFields(items);

    return res.status(200).json({
      success: true,
      data: enriched,
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