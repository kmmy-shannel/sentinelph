const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { reportSubmissionLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const AuditLog = require('../models/AuditLog');
const { getGenesisHash, verifyReportChain } = require('../utils/hashChain');

const router = express.Router();

// Number of independent reports against the same number that
// auto-opens a BlacklistEntry candidate for officer review.
const AUTO_CANDIDATE_THRESHOLD = 3;

/**
 * Calls the internal AI Scam Detector microservice (Section 4.d) to
 * classify report text. Fails gracefully: if the service is unreachable
 * or slow (>2s), the report still proceeds with an 'uncertain' flag
 * rather than blocking submission — the AI signal is advisory only.
 */
async function classifyReportText(text) {
  const aiUrl = process.env.AI_DETECTOR_URL;

  if (!aiUrl) {
    return { label: 'uncertain', probability: null, source: 'unavailable' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI detector responded with HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      label: ['likely_scam', 'uncertain', 'likely_legitimate'].includes(data.label)
        ? data.label
        : 'uncertain',
      probability: typeof data.scam_probability === 'number' ? data.scam_probability : null,
      source: 'ai-detector',
    };
  } catch (err) {
    console.error('[Reports] AI detector call failed, defaulting to uncertain:', err.message);
    return { label: 'uncertain', probability: null, source: 'unavailable' };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateSubmission(body) {
  const errors = [];

  if (!body.textData || typeof body.textData !== 'string' || body.textData.trim().length === 0) {
    errors.push('textData is required and must be a non-empty string.');
  } else if (body.textData.length > 2000) {
    errors.push('textData must be 2000 characters or fewer.');
  }

  if (!body.reportedNumber || typeof body.reportedNumber !== 'string' || body.reportedNumber.trim().length === 0) {
    errors.push('reportedNumber is required and must be a non-empty string.');
  }

  if (!body.nullifier || typeof body.nullifier !== 'string' || body.nullifier.trim().length === 0) {
    errors.push('nullifier is required and must be a non-empty string.');
  }

  if (body.location !== undefined && body.location !== null) {
    if (typeof body.location !== 'object' || Array.isArray(body.location)) {
      errors.push('location must be an object with optional address, region, lat, lng fields.');
    } else {
      const { lat, lng } = body.location;
      if (lat !== undefined && lat !== null && (typeof lat !== 'number' || lat < -90 || lat > 90)) {
        errors.push('location.lat must be a number between -90 and 90.');
      }
      if (lng !== undefined && lng !== null && (typeof lng !== 'number' || lng < -180 || lng > 180)) {
        errors.push('location.lng must be a number between -180 and 180.');
      }
    }
  }

  return errors;
}

/**
 * If a reported number now has AUTO_CANDIDATE_THRESHOLD or more
 * independent reports and no BlacklistEntry exists yet, opens one in
 * 'pending' state for officer review. Never throws — failures here
 * must not roll back a successful, already-chained report submission.
 */
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
// POST /api/v1/reports  — Submit a new report (Citizen only)
// =====================================================================
router.post(
  '/',
  verifyFirebaseToken,
  requireRole('citizen'),
  reportSubmissionLimiter,
  asyncHandler(async (req, res) => {
    const validationErrors = validateSubmission(req.body);
    if (validationErrors.length > 0) {
      throw new ApiError(400, validationErrors.join(' '), 'VALIDATION_ERROR');
    }

    const { textData, reportedNumber, nullifier, location } = req.body;

    // 1. AI classification (advisory only — never blocks or auto-decides).
    const aiFlag = await classifyReportText(textData);

    // 2. Fetch the current chain tail.
    const tail = await Report.findOne().sort({ sequence: -1 }).select('sequence hash').lean();
    const previousHash = tail ? tail.hash : getGenesisHash();
    const nextSequence = tail ? tail.sequence + 1 : 0;

    // 3. Create and persist — the pre-save hook computes `hash`.
    let report;
    try {
      report = await Report.create({
        textData: textData.trim(),
        reportedNumber: reportedNumber.trim(),
        nullifier: nullifier.trim(),
        location: location || {},
        aiFlag,
        previousHash,
        sequence: nextSequence,
      });
    } catch (err) {
      if (err.code === 11000) {
        if (err.keyPattern && err.keyPattern.nullifier) {
          throw new ApiError(409, 'Duplicate reporter for this epoch: this nullifier has already been used.', 'DUPLICATE_NULLIFIER');
        }
        throw new ApiError(409, 'A chain-sequencing conflict occurred. Please retry the submission.', 'SEQUENCE_CONFLICT');
      }
      throw err;
    }

    // 4. Audit trail (append-only, itself outside the report's own hash chain
    //    but permanently recorded).
    await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'REPORT_SUBMITTED',
      ipAddress: req.ip,
      metadata: { reportId: report.reportId, reportedNumber: report.reportedNumber },
    });

    // 5. Non-blocking: check whether this pushes the number past the
    //    auto-candidate threshold for officer review.
    await maybeOpenBlacklistCandidate(report.reportedNumber, report.location?.region);

    return res.status(201).json({
      success: true,
      message: 'Report submitted and appended to the tamper-evident chain.',
      data: {
        reportId: report.reportId,
        status: report.status,
        aiFlag: report.aiFlag,
        sequence: report.sequence,
        hash: report.hash,
        createdAt: report.createdAt,
      },
    });
  })
);

// =====================================================================
// GET /api/v1/reports  — List/paginate reports (Officer, Analyst, Auditor)
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

    if (req.query.reportedNumber) {
      query.reportedNumber = req.query.reportedNumber;
    }

    // Officers default-scope to their own jurisdiction; an explicit
    // region query that contradicts their jurisdiction is rejected,
    // since multi-jurisdiction assignment is not modeled in this phase.
    if (req.user.role === 'officer') {
      if (req.query.region && req.user.jurisdiction && req.query.region !== req.user.jurisdiction) {
        throw new ApiError(403, 'Officers may only query reports within their assigned jurisdiction.', 'JURISDICTION_MISMATCH');
      }
      if (req.user.jurisdiction) {
        query['location.region'] = req.user.jurisdiction;
      }
    } else if (req.query.region) {
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
// (Auditor only)
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

    return res.status(200).json({
      success: true,
      data: result,
    });
  })
);

// =====================================================================
// GET /api/v1/reports/:reportId  — Fetch a single report
// (Officer, Analyst, Auditor)
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

    if (
      req.user.role === 'officer' &&
      req.user.jurisdiction &&
      report.location?.region &&
      report.location.region !== req.user.jurisdiction
    ) {
      throw new ApiError(403, 'This report falls outside your assigned jurisdiction.', 'JURISDICTION_MISMATCH');
    }

    return res.status(200).json({ success: true, data: report });
  })
);

module.exports = router;