// services/api/controllers/reportController.js
'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const Report = require('../models/Report');
const { getAiScamAssessment, forwardImageForOcr } = require('../utils/aiServiceClient');
const { getGenesisHash } = require('../utils/hashChain');
const { computeCitizenHash } = require('../utils/citizenHash');

const DEFAULT_SCAM_TYPE = 'UNKNOWN';
const PENDING_STATUS = 'pending';
const SCREENSHOT_PLACEHOLDER = '[screenshot attached]';

// Sybil / spam guard: max reports one pseudonymous citizen may file per
// rolling hour. Enforced against the database (not process memory), so it
// holds across restarts and multiple API instances.
const CITIZEN_RATE_WINDOW_MS = 60 * 60 * 1000;
const CITIZEN_MAX_REPORTS_PER_WINDOW = (() => {
  const parsed = parseInt(process.env.CITIZEN_MAX_REPORTS_PER_HOUR, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
})();

function normalizeScamType(value) {
  if (typeof value !== 'string') return DEFAULT_SCAM_TYPE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SCAM_TYPE;
}

function stripDataUriPrefix(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

function normalizeAiFlag(aiFlag) {
  if (!aiFlag) return null;
  return {
    ...aiFlag,
    available: aiFlag.available !== false,
    isScam: aiFlag.isScam ?? aiFlag.is_scam ?? null,
    confidenceScore: aiFlag.confidenceScore ?? aiFlag.confidence_score ?? null,
    probabilityScore: aiFlag.probabilityScore ?? aiFlag.probability_score ?? null,
    riskLevel: aiFlag.riskLevel ?? aiFlag.risk_level ?? 'UNKNOWN',
    explanationReasons: aiFlag.explanationReasons ?? aiFlag.explanation_reasons ?? [],
    label: aiFlag.label ?? null,
    ocrText: aiFlag.ocrText ?? aiFlag.ocr_text ?? null,
  };
}

async function createReport(req, res, next) {
  try {
    const body = req.body || {};

    // ─── Sender normalization (must also become `reportedNumber` below) ──
    const sender =
      body.sender ?? body.senderNumber ?? body.reportedNumber ?? body.scammerNumber ?? null;
    const scamType = normalizeScamType(body.scamType ?? body.category);

    // Sender is required (Option A). Return 400 with a clear message
    // instead of letting Mongoose throw a raw 500 ValidationError.
    if (!sender || typeof sender !== 'string' || sender.trim().length === 0) {
      return res.status(400).json({
        error: 'SENDER_REQUIRED',
        message: 'A sender number or header is required to submit a report.',
      });
    }
    const nullifier = body.nullifier ?? body.nullifierHash ?? null;
    const zkpHash = body.zkpHash ?? null;

    const uploadedFile =
      req.file || (Array.isArray(req.files) ? req.files[0] : null);

    const rawEvidenceImage = body.evidenceImage || null;

    let content = (
      body.content ?? body.reportText ?? body.textData ?? body.evidenceText ?? body.text ?? ''
    ).trim();

    if (!content && !uploadedFile && !rawEvidenceImage && !body.evidenceImageBase64) {
      return res.status(400).json({
        error: 'A report must include content and/or a screenshot.',
      });
    }

    // ─── Pseudonymous citizen identity (Sybil prevention) ──────────────
    // citizenHash = HMAC-SHA256(CITIZEN_SALT, req.user.uid || req.ip).
    // The raw uid / IP is never stored; only the keyed hash is, which lets
    // us rate-limit per citizen without a plain identity link in Report.
    // The check runs BEFORE the AI call so a throttled citizen cannot burn
    // metered FastAPI / Hugging Face quota.
    const citizenHash = computeCitizenHash(req);

    if (citizenHash) {
      const windowStart = new Date(Date.now() - CITIZEN_RATE_WINDOW_MS);
      const recentCount = await Report.countDocuments({
        citizenHash,
        createdAt: { $gte: windowStart },
      });

      if (recentCount >= CITIZEN_MAX_REPORTS_PER_WINDOW) {
        res.set('Retry-After', String(Math.ceil(CITIZEN_RATE_WINDOW_MS / 1000)));
        return res.status(429).json({
          error: 'REPORT_RATE_LIMITED',
          message:
            'You have reached the hourly report limit. Please try again later.',
        });
      }
    }

    // ─── AI assessment (unchanged) ────────────────────────────────────
    let aiFlag = null;
    let aiOcrText = null;

    if (uploadedFile || rawEvidenceImage || body.evidenceImageBase64) {
      const imageBase64 = rawEvidenceImage
        ? stripDataUriPrefix(rawEvidenceImage)
        : body.evidenceImageBase64
        ? stripDataUriPrefix(body.evidenceImageBase64)
        : uploadedFile.buffer.toString('base64');

      aiFlag = normalizeAiFlag(
        await getAiScamAssessment({ text: content || undefined, imageBase64 })
      );
      aiOcrText = aiFlag?.ocrText || null;

      if (
        (!content || content === SCREENSHOT_PLACEHOLDER) &&
        aiOcrText &&
        aiOcrText.trim().length > 0
      ) {
        content = aiOcrText;
      }
    } else if (content) {
      aiFlag = normalizeAiFlag(await getAiScamAssessment({ text: content }));
    }

    // ─── Location normalization ────────────────────────────────────────
    // The mobile client sends latitude/longitude (from GPS) plus an
    // already-resolved `region` string (from the bundled bounding-box
    // resolver). We persist all three so:
    //   1. The officer queue's region filter can match the report.
    //   2. The public alert feed can show "NCR" instead of raw coords.
    //   3. A report whose region couldn't be resolved still lands in the
    //      queue via the UNCLASSIFIED sentinel.
    const rawLocation = body.location && typeof body.location === 'object' ? body.location : {};
    const rawLatitude =
      rawLocation.latitude ?? rawLocation.lat ?? body.latitude ?? null;
    const rawLongitude =
      rawLocation.longitude ?? rawLocation.lng ?? body.longitude ?? null;
    const rawRegion =
      (typeof rawLocation.region === 'string' && rawLocation.region.trim()) ||
      (typeof body.region === 'string' && body.region.trim()) ||
      'UNCLASSIFIED';

    const location =
      rawLatitude != null || rawLongitude != null || rawRegion
        ? {
            latitude: rawLatitude,
            longitude: rawLongitude,
            region: rawRegion,
          }
        : undefined;

    const evidenceFiles = Array.isArray(body.evidenceFiles)
      ? body.evidenceFiles
      : body.evidenceFiles
      ? [body.evidenceFiles]
      : [];

    // ─── Fetch the chain tail so the required immutable fields ─────────
    // The Report model's `pre('save')` hook computes `hash` from
    // `previousHash` + the canonical payload, so we must set `previousHash`
    // and `sequence` BEFORE the first save. This mirrors exactly what
    // verifyReportChain expects when it reads the chain back.
    const tail = await Report.findOne()
      .sort({ sequence: -1 })
      .select('sequence hash')
      .lean();

    const previousHash = tail && tail.hash ? tail.hash : getGenesisHash();
    const nextSequence = tail && typeof tail.sequence === 'number' ? tail.sequence + 1 : 0;

    // ─── Build the document with every required field populated ────────
    const report = new Report({
      reportId: body.reportId || `RPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,

      // Chain anchor (required, immutable, participates in the hash)
      previousHash,
      sequence: nextSequence,

      // Required by the model — this is the same value as `sender` but
      // stored under the model's canonical field name.
      reportedNumber: sender || null,

      // Hashed canonical fields
      textData: content || null,
      nullifier: nullifier,
      location: location || {},
      aiFlag: aiFlag || undefined,

      // Non-hashed display/workflow fields
      sender: sender || null,
      scammerNumber: sender || null,
      evidenceText: content || null,
      content: content || null,
      scamType,
      category: scamType,
      channel: body.channel || 'SMS',
      evidenceImage:
        rawEvidenceImage ||
        (uploadedFile
          ? `data:${uploadedFile.mimetype};base64,${uploadedFile.buffer.toString('base64')}`
          : null),
      hasEvidenceImage: Boolean(uploadedFile || rawEvidenceImage || body.evidenceImageBase64),
      evidenceFiles,
      nullifierHash: nullifier,
      zkpHash,
      aiScore:
        aiFlag && typeof aiFlag.probabilityScore === 'number'
          ? aiFlag.probabilityScore
          : null,

      // Pseudonymous reporter identifier (not part of the hash payload).
      citizenHash,

      // Region always wins over any legacy `jurisdiction` field.
      // Priority: canonical location.region → legacy body.jurisdiction → UNCLASSIFIED.
      jurisdiction:
        (location && location.region) ||
        body.jurisdiction ||
        'UNCLASSIFIED',
      status: PENDING_STATUS,
      consensusState: { approvals: 0, rejections: 0, required: 2 },
      // createdAt is set by the model's `timestamps` option, but we set it
      // here explicitly so it's available to the `pre('save')` hash hook.
      createdAt: new Date(),
    });

    // ─── First (and only) save. The pre-save hook computes `report.hash` ─
    await report.save();

    // Note: the previous version called `appendToChain` and then tried a
    // second `report.save()` to persist the returned chain entry. That
    // second save was rejected by the model's immutability guard and
    // silently swallowed in the try/catch, so `previousHash`/`sequence`/
    // `hash` were never written. The chain is now written directly by the
    // model's `pre('save')` hook on the single save above, using the same
    // computeHash + getGenesisHash utilities, so the chain stays valid
    // and `verifyReportChain` continues to pass.

    // Never echo the pseudonymous identifier back to the client.
    const reportPayload = report.toObject();
    delete reportPayload.citizenHash;

    return res.status(201).json({
      message: 'Report created successfully.',
      reportId: report.reportId,
      id: report._id.toString(),
      status: report.status,
      scamType: report.scamType,
      sequence: report.sequence,
      hash: report.hash,
      previousHash: report.previousHash,
      report: reportPayload,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/reports/analyze
 * Layer 1 instant preview — advisory only, no persistence. Response shape
 * is normalized (see normalizeAiFlag) so `ocrText` is always present when
 * the AI service extracted text from a screenshot.
 */
async function analyzeReportPreview(req, res, next) {
  try {
    const { text, imageBase64 } = req.body || {};
    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'text or imageBase64 is required.' });
    }
    const aiFlag = await getAiScamAssessment({ text, imageBase64 });
    return res.status(200).json(normalizeAiFlag(aiFlag));
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/reports/ocr
 */
async function analyzeReportImage(req, res, next) {
  try {
    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file || !file.buffer) {
      return res.status(400).json({ error: 'An image file is required (field name: "image").' });
    }

    const scamType = normalizeScamType(req.body?.scamType ?? req.body?.category);

    const ocrResult = await forwardImageForOcr({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      scamType,
    });

    if (!ocrResult.available) {
      return res.status(200).json({
        available: false,
        text: '',
        confidence: null,
        error: ocrResult.error || 'OCR_UNAVAILABLE',
      });
    }

    let aiFlag = null;
    if (ocrResult.text && ocrResult.text.trim().length > 0) {
      aiFlag = normalizeAiFlag(await getAiScamAssessment({ text: ocrResult.text }));
    }

    return res.status(200).json({
      available: true,
      text: ocrResult.text,
      ocrText: ocrResult.text,
      confidence: ocrResult.confidence,
      isScam: aiFlag?.isScam ?? ocrResult.isScam ?? null,
      confidenceScore: aiFlag?.confidenceScore ?? ocrResult.confidenceScore ?? null,
      riskLevel: aiFlag?.riskLevel ?? ocrResult.riskLevel ?? 'UNKNOWN',
      explanationReasons: aiFlag?.explanationReasons ?? ocrResult.explanationReasons ?? [],
      aiFlag,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createReport,
  analyzeReportPreview,
  analyzeReportImage,
};