// services/api/routes/reports.js
const express = require('express');
const multer = require('multer');

const { verifyFirebaseToken } = require('../middleware/auth');
const {
  requireRole,
  enforceAuditorReadOnly,
  requireJurisdictionMatch,
} = require('../middleware/rbac');
const { reportSubmissionLimiter } = require('../middleware/rateLimiter');
const { analyzeLimiter, ocrLimiter } = require('../middleware/rateLimiter');
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

const {
  attachReport,
  getReportJurisdiction,
  listReports,
  getReportById,
  voteOnReport,
} = require('../controllers/reportReviewController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const AUTO_CANDIDATE_THRESHOLD = 3;

// Officers may only act on reports inside their assigned jurisdiction.
// Unscoped reports (UNCLASSIFIED / no region) resolve to null and pass.
const jurisdictionGuard = requireJurisdictionMatch(getReportJurisdiction);

/**
 * Informational candidate tracking only: keeps BlacklistEntry.reportCount
 * fresh and opens an 'under_review' candidate once a number has been
 * reported AUTO_CANDIDATE_THRESHOLD times, so the mobile lookup can show
 * "Under Review". It never decides anything — a number becomes
 * 'blacklisted' exclusively through report-level Two-Officer consensus
 * (see reportReviewController.voteOnReport).
 */
async function maybeOpenBlacklistCandidate(reportedNumber, region) {
  try {
    const phoneNumber = String(reportedNumber || '').trim();
    if (!phoneNumber) return;

    // Atomic increment: concurrent submissions can no longer lose counts.
    const existing = await BlacklistEntry.findOneAndUpdate(
      { phoneNumber },
      { $inc: { reportCount: 1 } },
      { new: true }
    );

    if (existing) {
      if (existing.status === 'pending' && existing.reportCount >= AUTO_CANDIDATE_THRESHOLD) {
        await BlacklistEntry.updateOne(
          { phoneNumber, status: 'pending' },
          { $set: { status: 'under_review' } }
        );
      }
      return;
    }

    const reportCount = await Report.countDocuments({ reportedNumber: phoneNumber });
    if (reportCount >= AUTO_CANDIDATE_THRESHOLD) {
      await BlacklistEntry.create({
        phoneNumber,
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
// Rate limited: each call hits the metered AI backend.
// =====================================================================
router.post('/analyze', analyzeLimiter, analyzeReportPreview);

// =====================================================================
// POST /api/v1/reports/ocr — Multipart screenshot → FastAPI /ocr
// Limiter runs BEFORE multer so a throttled client never gets its
// (up to 15 MB) upload buffered into memory.
// =====================================================================
router.post('/ocr', ocrLimiter, upload.single('image'), analyzeReportImage);

// =====================================================================
// POST /api/v1/reports — Submit a new report (Citizen only)
// =====================================================================
router.post(
  '/',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('citizen'),
  reportSubmissionLimiter,
  upload.single('evidence'),
  asyncHandler(async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      // Side effects fire ONLY for a report that was actually created (201).
      // Previously they also fired on 400/429 error bodies, which logged a
      // phantom REPORT_SUBMITTED and inflated the blacklist report count.
      if (res.statusCode === 201) {
        const reportId = body?.reportId || body?.data?.reportId;
        const reportedNumber =
          body?.report?.reportedNumber ||
          req.body?.senderNumber ||
          req.body?.reportedNumber ||
          req.body?.sender;
        const region =
          body?.report?.location?.region ||
          req.body?.location?.region ||
          req.body?.region;

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
      }
      return originalJson(body);
    };
    return createReport(req, res, next);
  })
);

// =====================================================================
// GET /api/v1/reports — List/paginate reports (region-scoped for officers)
//   ?page=1&limit=20&bucket=pending|resolved|all&status=&reportedNumber=&region=
// =====================================================================
router.get(
  '/',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer', 'analyst', 'auditor'),
  listReports
);

// =====================================================================
// GET /api/v1/reports/chain/verify — Recompute & verify chain integrity
// (declared BEFORE '/:id' so "chain" is never treated as a report id)
// =====================================================================
router.get(
  '/chain/verify',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
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
// GET /api/v1/reports/:id — Fetch a single report (incl. screenshot)
// =====================================================================
router.get(
  '/:id',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer', 'analyst', 'auditor'),
  attachReport,
  jurisdictionGuard,
  getReportById
);

// =====================================================================
// POST /api/v1/reports/:id/vote — Officer approve/reject
// CANONICAL Two-Officer consensus entry point. At 2 approvals the report
// becomes 'blacklisted' and the number is upserted into BlacklistEntry.
// =====================================================================
router.post(
  '/:id/vote',
  verifyFirebaseToken,
  enforceAuditorReadOnly,
  requireRole('officer'),
  attachReport,
  jurisdictionGuard,
  voteOnReport
);

module.exports = router;