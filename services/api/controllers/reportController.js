// services/api/controllers/reportController.js
'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const Report = require('../models/Report');
const { getAiScamAssessment, forwardImageForOcr } = require('../utils/aiServiceClient');
const { getGenesisHash } = require('../utils/hashChain');
const { computeCitizenHash } = require('../utils/citizenHash');
const { classifyTarget } = require('../utils/targetClassifier');

const DEFAULT_SCAM_TYPE = 'UNKNOWN';
const PENDING_STATUS = 'pending';
const SCREENSHOT_PLACEHOLDER = '[screenshot attached]';

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

// FIX: Robust AI flag normalization. The AI service may return the label
// under any of `label`, `tier`, or `level_1_label`; and the boolean
// `is_scam` instead of a string label. Normalize all of those to the
// schema's canonical enum so the DB stores `malicious` / `legitimate`
// / `grey_area`, not the raw brand name that caused the mobile-vs-web
// discrepancy.
function normalizeAiFlag(aiFlag) {
  if (!aiFlag) return null;
  const data = aiFlag.data || aiFlag.prediction || aiFlag;

  let rawLabel = data.label ?? data.tier ?? data.level_1_label ?? null;
  if (rawLabel === true) rawLabel = 'malicious';
  if (rawLabel === false) rawLabel = 'legitimate';

  const finalLabel = rawLabel ? String(rawLabel).toLowerCase() : 'unavailable';
  const finalSubtype = data.subtype ?? data.level_2_label ?? null;

  return {
    ...data,
    available: data.available !== false,
    isScam: data.isScam ?? data.is_scam ?? (finalLabel === 'malicious'),
    confidenceScore: data.confidenceScore ?? data.confidence_score ?? null,
    probabilityScore: data.probabilityScore ?? data.probability_score ?? null,
    riskLevel: data.riskLevel ?? data.risk_level ?? 'UNKNOWN',
    explanationReasons: data.explanationReasons ?? data.explanation_reasons ?? [],
    label: finalLabel,
    subtype: finalSubtype,
    subtypeConfidence: data.subtypeConfidence ?? data.subtype_confidence ?? null,
    subtypeModelVersion: data.subtypeModelVersion ?? data.subtype_model_version ?? null,
    ocrText: data.ocrText ?? data.ocr_text ?? null,
  };
}

async function createReport(req, res, next) {
  try {
    const body = req.body || {};

    const sender =
      body.sender ?? body.senderNumber ?? body.reportedNumber ?? body.scammerNumber ?? null;
    const scamType = normalizeScamType(body.scamType ?? body.category);

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
      return res.status(400).json({ error: 'A report must include content and/or a screenshot.' });
    }

    const { targetKind, brandName } = classifyTarget({
      sender,
      content:
        body.content || body.reportText || body.textData || body.evidenceText || body.text || '',
    });

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
          message: 'You have reached the hourly report limit. Please try again later.',
        });
      }
    }

    const reporterShared = body.reporterShared === true;
    let reporterName = null;
    let reporterEmail = null;
    if (reporterShared) {
      reporterName = (typeof body.reporterName === 'string' && body.reporterName.trim().length > 0
        ? body.reporterName.trim().slice(0, 120)
        : (req.user && req.user.name) || null);
      reporterEmail = (typeof body.reporterEmail === 'string' && body.reporterEmail.trim().length > 0
        ? body.reporterEmail.trim().toLowerCase().slice(0, 254)
        : (req.user && req.user.email) || null);
    }

    let aiFlag = null;
    let aiOcrText = null;

    if (uploadedFile || rawEvidenceImage || body.evidenceImageBase64) {
      const imageBase64 = rawEvidenceImage
        ? stripDataUriPrefix(rawEvidenceImage)
        : body.evidenceImageBase64
        ? stripDataUriPrefix(body.evidenceImageBase64)
        : uploadedFile.buffer.toString('base64');

      aiFlag = normalizeAiFlag(await getAiScamAssessment({ text: content || undefined, imageBase64 }));
      aiOcrText = aiFlag?.ocrText || null;

      if ((!content || content === SCREENSHOT_PLACEHOLDER) && aiOcrText && aiOcrText.trim().length > 0) {
        content = aiOcrText;
      }
    } else if (content) {
      aiFlag = normalizeAiFlag(await getAiScamAssessment({ text: content }));
    }

    const rawLocation = body.location && typeof body.location === 'object' ? body.location : {};
    const rawLatitude = rawLocation.latitude ?? rawLocation.lat ?? body.latitude ?? null;
    const rawLongitude = rawLocation.longitude ?? rawLocation.lng ?? body.longitude ?? null;
    const rawRegion =
      (typeof rawLocation.region === 'string' && rawLocation.region.trim()) ||
      (typeof body.region === 'string' && body.region.trim()) ||
      'UNCLASSIFIED';

    const location = rawLatitude != null || rawLongitude != null || rawRegion
      ? { latitude: rawLatitude, longitude: rawLongitude, region: rawRegion }
      : undefined;

    const evidenceFiles = Array.isArray(body.evidenceFiles)
      ? body.evidenceFiles
      : body.evidenceFiles ? [body.evidenceFiles] : [];

    const tail = await Report.findOne().sort({ sequence: -1 }).select('sequence hash').lean();
    const previousHash = tail && tail.hash ? tail.hash : getGenesisHash();
    const nextSequence = tail && typeof tail.sequence === 'number' ? tail.sequence + 1 : 0;

    const report = new Report({
      reportId: body.reportId || `RPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      previousHash,
      sequence: nextSequence,
      reportedNumber: sender || null,
      targetKind,
      brandName,
      textData: content || null,
      nullifier,
      location: location || {},
      aiFlag: aiFlag || undefined,
      sender: sender || null,
      scammerNumber: sender || null,
      evidenceText: content || null,
      content: content || null,
      scamType,
      category: scamType,
      channel: body.channel || 'SMS',
      evidenceImage: rawEvidenceImage || (uploadedFile
        ? `data:${uploadedFile.mimetype};base64,${uploadedFile.buffer.toString('base64')}`
        : null),
      hasEvidenceImage: Boolean(uploadedFile || rawEvidenceImage || body.evidenceImageBase64),
      evidenceFiles,
      nullifierHash: nullifier,
      zkpHash,
      aiScore: aiFlag && typeof aiFlag.probabilityScore === 'number' ? aiFlag.probabilityScore : null,
      citizenHash,
      reporterName,
      reporterEmail,
      reporterShared: Boolean(reporterShared && (reporterName || reporterEmail)),
      jurisdiction: (location && location.region) || body.jurisdiction || 'UNCLASSIFIED',
      status: PENDING_STATUS,
      consensusState: { approvals: 0, rejections: 0, required: 2 },
      createdAt: new Date(),
    });

    try {
      await report.save();
    } catch (err) {
      if (err && err.code === 11000 && err.keyPattern?.nullifier) {
        const existing = await Report.findOne({ nullifier }).select('reportId sequence hash status').lean();
        return res.status(409).json({
          error: 'DUPLICATE_REPORT',
          message: 'This exact report has already been submitted. If you meant to submit a different message, please edit the content and try again.',
          existingReportId: existing?.reportId || null,
          existingStatus: existing?.status || null,
        });
      }
      throw err;
    }

    const reportPayload = report.toObject();
    delete reportPayload.citizenHash;
    delete reportPayload.reporterName;
    delete reportPayload.reporterEmail;
    delete reportPayload.reporterShared;

    return res.status(201).json({
      message: 'Report created successfully.',
      reportId: report.reportId,
      id: report._id.toString(),
      status: report.status,
      scamType: report.scamType,
      targetKind: report.targetKind,
      brandName: report.brandName,
      sequence: report.sequence,
      hash: report.hash,
      previousHash: report.previousHash,
      report: reportPayload,
    });
  } catch (err) {
    return next(err);
  }
}

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
      return res.status(200).json({ available: false, text: '', confidence: null, error: ocrResult.error || 'OCR_UNAVAILABLE' });
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