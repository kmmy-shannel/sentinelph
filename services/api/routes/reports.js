const express = require('express');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { reportSubmissionLimiter } = require('../middleware/rateLimiter');
const { asyncHandler, ApiError } = require('../middleware/errorHandler');
const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const AuditLog = require('../models/AuditLog');
const { getGenesisHash, verifyReportChain } = require('../utils/hashChain');
const { analyzeReportPreview } = require('../controllers/reportController');

const router = express.Router();

// Number of independent reports against the same number that
// auto-opens a BlacklistEntry candidate for officer review.
const AUTO_CANDIDATE_THRESHOLD = 3;

/**
 * Calls the internal AI Scam Detector microservice to classify text.
 * Resolves process.env.AI_SERVICE_URL and passes authentication header.
 */
async function classifyReportText({ text, imageBase64 } = {}) {
  const baseUrl = process.env.AI_SERVICE_URL || process.env.AI_DETECTOR_URL;

  if (!baseUrl) {
    return { available: false, label: 'uncertain', probability: null, riskLevel: 'UNKNOWN', explanationReasons: [] };
  }

  const aiUrl = baseUrl.endsWith('/predict') ? baseUrl : `${baseUrl.replace(/\/+$/, '')}/predict`;
  const apiKey = process.env.AI_SERVICE_API_KEY;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey || '',
      },
      // Forward either or both — matches PredictRequest's "at least one" contract.
      body: JSON.stringify({
        text: text || undefined,
        image_base64: imageBase64 || undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI detector responded with HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      available: true,
      isScam: Boolean(data.is_scam),
      label: data.is_scam ? 'likely_scam' : 'likely_legitimate',
      probability: typeof data.confidence_score === 'number' ? data.confidence_score : null,
      riskLevel: data.risk_level || 'LOW',
      explanationReasons: data.explanation_reasons || [],
      source: 'ai-detector',
    };
  } catch (err) {
    console.error('[Reports] AI detector call failed, defaulting to fallback:', err.message);
    return { available: false, label: 'uncertain', probability: null, riskLevel: 'UNKNOWN', explanationReasons: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateSubmission(body) {
  const errors = [];

  const hasText = typeof body.textData === 'string' && body.textData.trim().length > 0;
  const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.trim().length > 0;

  // Neither field is individually required — but at least one must be present.
  if (!hasText && !hasImage) {
    errors.push('Either textData or imageBase64 is required.');
  }
  if (hasText && body.textData.length > 2000) {
    errors.push('textData must be 2000 characters or fewer.');
  }
  if (hasImage && body.imageBase64.length > 5_000_000) {
    errors.push('imageBase64 payload is too large.');
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
// POST /api/v1/reports/analyze — Real-time live check endpoint for Mobile UI
// =====================================================================
router.post('/analyze', analyzeReportPreview);

// =====================================================================
// POST /api/v1/reports — Submit a new report (Citizen only)
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

    const { textData, imageBase64, reportedNumber, nullifier, location } = req.body;

    // 1. AI classification (advisory only) — text and/or image
    const aiFlag = await classifyReportText({ text: textData, imageBase64 });

    // 2. Fetch the current chain tail
    const tail = await Report.findOne().sort({ sequence: -1 }).select('sequence hash').lean();
    const previousHash = tail ? tail.hash : getGenesisHash();
    const nextSequence = tail ? tail.sequence + 1 : 0;

    // 3. Create and persist
    let report;
    try {
      report = await Report.create({
        textData: textData ? textData.trim() : undefined,
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

    // 4. Audit trail
       await AuditLog.record({
      userId: req.user.uid,
      role: req.user.role,
      action: 'REPORT_SUBMITTED',
      ipAddress: req.ip,
      metadata: { reportId: report.reportId, reportedNumber: report.reportedNumber },
    });

    // 5. Non-blocking candidate check
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
      query.status = req.query.status;
    }

    if (req.query.reportedNumber) {
      query.reportedNumber = req.query.reportedNumber;
    }

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