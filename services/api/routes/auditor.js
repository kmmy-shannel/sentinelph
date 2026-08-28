const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole, enforceAuditorReadOnly } = require('../middleware/rbac');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const AuditLog = require('../models/AuditLog');
const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const { verifyReportChain } = require('../utils/hashChain');

const router = express.Router();

// Every route on this router is Auditor-only and strictly read-only,
// enforced both by role and by verb (defense-in-depth per SRS 2.4).
router.use(verifyFirebaseToken, requireRole('auditor'), enforceAuditorReadOnly);

// =====================================================================
// GET /api/v1/auditor/logs — Paginated, filterable audit trail
// =====================================================================
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    const query = {};

    if (req.query.role) {
      query.role = req.query.role;
    }
    if (req.query.action) {
      query.action = req.query.action;
    }
    if (req.query.userId) {
      query.userId = req.query.userId;
    }
    if (req.query.from || req.query.to) {
      query.timestamp = {};
      if (req.query.from) {
        const fromDate = new Date(req.query.from);
        if (Number.isNaN(fromDate.getTime())) {
          throw new ApiError(400, "Query param 'from' must be a valid ISO date.", 'VALIDATION_ERROR');
        }
        query.timestamp.$gte = fromDate;
      }
      if (req.query.to) {
        const toDate = new Date(req.query.to);
        if (Number.isNaN(toDate.getTime())) {
          throw new ApiError(400, "Query param 'to' must be a valid ISO date.", 'VALIDATION_ERROR');
        }
        query.timestamp.$lte = toDate;
      }
    }

    const [items, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(query),
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

// =====================================================================
// GET /api/v1/auditor/logs/:id — Fetch a single audit entry
// =====================================================================
router.get(
  '/logs/:id',
  asyncHandler(async (req, res) => {
    let entry;
    try {
      entry = await AuditLog.findById(req.params.id).lean();
    } catch (err) {
      throw new ApiError(400, `"${req.params.id}" is not a valid audit log identifier.`, 'VALIDATION_ERROR');
    }

    if (!entry) {
      throw new ApiError(404, `No audit log entry found with id "${req.params.id}".`, 'NOT_FOUND');
    }

    return res.status(200).json({ success: true, data: entry });
  })
);

// =====================================================================
// GET /api/v1/auditor/chain-health — Full or ranged hash-chain
// verification (the Auditor's independent Verification Tool)
// =====================================================================
router.get(
  '/chain-health',
  asyncHandler(async (req, res) => {
    const startSequence = req.query.start !== undefined ? parseInt(req.query.start, 10) : undefined;
    const endSequence = req.query.end !== undefined ? parseInt(req.query.end, 10) : undefined;

    if (req.query.start !== undefined && Number.isNaN(startSequence)) {
      throw new ApiError(400, "Query param 'start' must be a valid integer sequence number.", 'VALIDATION_ERROR');
    }
    if (req.query.end !== undefined && Number.isNaN(endSequence)) {
      throw new ApiError(400, "Query param 'end' must be a valid integer sequence number.", 'VALIDATION_ERROR');
    }

    const result = await verifyReportChain(Report, { startSequence, endSequence });

    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'AUDITOR_CHAIN_HEALTH_CHECK',
      ipAddress: req.ip,
      metadata: { rangeChecked: result.rangeChecked, valid: result.valid, breaksFound: result.breaks.length },
    });

    return res.status(200).json({ success: true, data: result });
  })
);

// =====================================================================
// GET /api/v1/auditor/consensus-check — Cross-check that no
// BlacklistEntry was ever finalized with fewer than 2 distinct
// officer approvals (Officer Consensus Audit widget)
// =====================================================================
router.get(
  '/consensus-check',
  asyncHandler(async (req, res) => {
    const blacklisted = await BlacklistEntry.find({ status: 'blacklisted' }).lean();

    const anomalies = blacklisted
      .filter((entry) => !Array.isArray(entry.approvedBy) || entry.approvedBy.length < 2)
      .map((entry) => ({
        phoneNumber: entry.phoneNumber,
        approvedByCount: Array.isArray(entry.approvedBy) ? entry.approvedBy.length : 0,
        blacklistedAt: entry.blacklistedAt,
        reason: 'FINALIZED_BELOW_TWO_OFFICER_QUORUM',
      }));

    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'AUDITOR_CONSENSUS_CHECK',
      ipAddress: req.ip,
      metadata: { totalBlacklisted: blacklisted.length, anomaliesFound: anomalies.length },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalBlacklisted: blacklisted.length,
        anomaliesFound: anomalies.length,
        anomalies,
      },
    });
  })
);

module.exports = router;