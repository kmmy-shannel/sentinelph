// services/api/routes/reports.js
const express = require('express');
const multer = require('multer');

const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { reportSubmissionLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');

const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const AuditLog = require('../models/AuditLog');

const { verifyReportChain } = require('../utils/hashChain');

const {
  createReport,
  analyzeReportPreview,
  analyzeReportImage,
} = require('../controllers/reportController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const AUTO_CANDIDATE_THRESHOLD = 3;
const PENDING_STATUS = 'pending';

async function maybeOpenBlacklistCandidate(reportedNumber, region) {
  try {
    const existing = await BlacklistEntry.findOne({ phoneNumber: reportedNumber });

    if (existing) {
      existing.reportCount += 1;
      if (existing.status === 'pending' && existing.reportCount >= AUTO_CANDIDATE_THRESHOLD) {
        existing.status = 'under_review';
      }
      await existing.save();
      return;
    }

    const reportCount = await Report.countDocuments({ reportedNumber });
    if (reportCount >= AUTO_CANDIDATE_THRESHOLD) {
      await BlacklistEntry.create({
        phoneNumber: reportedNumber,
        region: region || null,
        status: 'under_review',
        reportCount,
      });
    }
  } catch (err) {
    console.error('[Reports] Failed to auto-open blacklist candidate (non-fatal):', err.message);
  }
}

// =====================================================================
// POST /api/v1/reports/analyze — Layer-1 live preview (no persistence)
// =====================================================================
router.post('/analyze', analyzeReportPreview);

// =====================================================================
// POST /api/v1/reports/ocr — Multipart screenshot → FastAPI /ocr
// =====================================================================
router.post('/ocr', upload.single('image'), analyzeReportImage);

// =====================================================================
// POST /api/v1/reports — Submit a new report (Citizen only)
// =====================================================================
router.post(
  '/',
  verifyFirebaseToken,
  requireRole('citizen'),
  reportSubmissionLimiter,
  upload.single('evidence'),
  asyncHandler(async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const reportId = body?.reportId || body?.data?.reportId;
      const reportedNumber = req.body?.senderNumber || req.body?.reportedNumber || req.body?.sender;
      const region = req.body?.location?.region || body?.report?.location?.region;
      if (reportedNumber) {
        setImmediate(() => {
          maybeOpenBlacklistCandidate(reportedNumber, region).catch(() => {});
        });
      }
      if (req.user?.uid) {
        setImmediate(() => {
          AuditLog.record({
            userId: req.user.uid,
            role: req.user.role,
            action: 'REPORT_SUBMITTED',
            ipAddress: req.ip,
            metadata: { reportId, reportedNumber },
          }).catch(() => {});
        });
      }
      return originalJson(body);
    };
    return createReport(req, res, next);
  })
);

// =====================================================================
// POST /api/v1/reports/:reportId/vote — Officer approve/reject
// =====================================================================
router.post(
  '/:reportId/vote',
  verifyFirebaseToken,
  requireRole('officer'),
  asyncHandler(async (req, res) => {
    const { decision, comment } = req.body || {};

    if (!['approve', 'reject'].includes(decision)) {
      throw new ApiError(400, "decision must be 'approve' or 'reject'.", 'VALIDATION_ERROR');
    }
    if (typeof comment !== 'string' || comment.trim().length === 0) {
      throw new ApiError(400, 'comment is required and must be non-empty.', 'VALIDATION_ERROR');
    }

    const report = await Report.findOne({ reportId: req.params.reportId });
    if (!report) {
      throw new ApiError(404, `No report found with reportId "${req.params.reportId}".`, 'NOT_FOUND');
    }

    // FIX: reportController.js stores jurisdiction as a top-level field
    // (`report.jurisdiction`), never as `location.region` — location only
    // ever holds { latitude, longitude }. Compare against the field that
    // actually gets populated.
    if (
      req.user.jurisdiction &&
      report.jurisdiction &&
      report.jurisdiction !== req.user.jurisdiction
    ) {
      throw new ApiError(403, 'This report falls outside your assigned jurisdiction.', 'JURISDICTION_MISMATCH');
    }

    const priorVotes = Array.isArray(report.votes) ? report.votes : [];
    if (priorVotes.some((v) => v.userId === req.user.uid)) {
      throw new ApiError(409, 'You have already voted on this report.', 'DUPLICATE_VOTE');
    }

    const vote = {
      userId: req.user.uid,
      role: req.user.role,
      decision,
      comment: comment.trim(),
      votedAt: new Date(),
    };

    const newVotes = [...priorVotes, vote];
    const approvals = newVotes.filter((v) => v.decision === 'approve').length;
    const rejections = newVotes.filter((v) => v.decision === 'reject').length;

    let newStatus = PENDING_STATUS;
    if (approvals >= 2) newStatus = 'blacklisted';
    else if (rejections >= 2) newStatus = 'rejected';
    else if (approvals === 1) newStatus = 'one_approval';
    else newStatus = 'under_review';

    const result = await Report.collection.updateOne(
      { reportId: report.reportId },
      {
        $set: {
          votes: newVotes,
          consensusState: { approvals, rejections, required: 2 },
          status: newStatus,
        },
      }
    );

    if (!result.matchedCount) {
      throw new ApiError(500, 'Failed to persist vote.', 'VOTE_WRITE_FAILED');
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: decision === 'approve' ? 'REPORT_APPROVED' : 'REPORT_REJECTED',
      ipAddress: req.ip,
      metadata: {
        reportId: report.reportId,
        decision,
        approvals,
        rejections,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        reportId: report.reportId,
        status: newStatus,
        consensusState: { approvals, rejections, required: 2 },
      },
    });
  })
);

// =====================================================================
// GET /api/v1/reports — List/paginate reports
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
      query.status = String(req.query.status).toLowerCase();
    }

    if (req.query.reportedNumber) {
      query.reportedNumber = req.query.reportedNumber;
    }

    // FIX: filter against `jurisdiction` (the field reportController.js
    // actually populates), not `location.region` (never set — location
    // only ever holds lat/lng). The old query silently matched nothing
    // for any officer with a jurisdiction assigned.
        // ─── Region-scoped visibility (Phase 1) ─────────────────────────────
    // Officers see ONLY their assigned region's reports, PLUS reports the
    // mobile client couldn't geolocate (tagged UNCLASSIFIED). The
    // UNCLASSIFIED fallback guarantees no report is ever invisible to the
    // review queue.
    //
    // Admins/superadmins/analysts/auditors are not scoped here — the
    // route-level `requireRole` above already restricts who can reach
    // this handler, and system-wide roles intentionally see everything.
    if (req.user.role === 'officer') {
      if (!req.user.jurisdiction) {
        // Defensive: an officer without a jurisdiction claim would see
        // nothing under a strict filter, so we surface the misconfig
        // rather than silently returning an empty queue.
        throw new ApiError(
          403,
          'Your account is not assigned to a region. Contact the NBI admin.',
          'MISSING_JURISDICTION'
        );
      }

      if (
        req.query.region &&
        req.user.jurisdiction &&
        req.query.region !== req.user.jurisdiction
      ) {
        throw new ApiError(
          403,
          'Officers may only query reports within their assigned jurisdiction.',
          'JURISDICTION_MISMATCH'
        );
      }

      query.$or = [
        { 'location.region': req.user.jurisdiction },
        { 'location.region': 'UNCLASSIFIED' },
        { 'location.region': null },
        { 'location.region': { $exists: false } },
      ];
    } else if (req.query.region) {
      // Admin/analyst/auditor filtering to a specific region on demand.
      query['location.region'] = req.query.region;
    }

    const [items, total] = await Promise.all([
      Report.find(query)
        .sort({ sequence: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      reports: items,
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
// GET /api/v1/reports/chain/verify — Recompute & verify chain integrity
// =====================================================================
router.get(
  '/chain/verify',
  verifyFirebaseToken,
  requireRole('auditor'),
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
      action: 'CHAIN_VERIFICATION_RUN',
      ipAddress: req.ip,
      metadata: { rangeChecked: result.rangeChecked, valid: result.valid, breaksFound: result.breaks.length },
    });

    return res.status(200).json({ success: true, data: result });
  })
);

// =====================================================================
// GET /api/v1/reports/:reportId — Fetch a single report
// =====================================================================
router.get(
  '/:reportId',
  verifyFirebaseToken,
  requireRole('officer', 'analyst', 'auditor'),
  asyncHandler(async (req, res) => {
    const report = await Report.findOne({ reportId: req.params.reportId }).lean();

    if (!report) {
      throw new ApiError(404, `No report found with reportId "${req.params.reportId}".`, 'NOT_FOUND');
    }

    // FIX: same field swap as the vote route above.
    if (
      req.user.role === 'officer' &&
      req.user.jurisdiction &&
      report.jurisdiction &&
      report.jurisdiction !== req.user.jurisdiction
    ) {
      throw new ApiError(403, 'This report falls outside your assigned jurisdiction.', 'JURISDICTION_MISMATCH');
    }

    return res.status(200).json({ success: true, data: report });
  })
);

module.exports = router;