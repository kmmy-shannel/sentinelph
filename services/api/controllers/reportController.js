/**
 * services/api/controllers/reportController.js
 * -----------------------------------------------
 * Integration snippet: calling the AI Scam Detection microservice
 * during report ingestion, BEFORE the report is appended to the hash
 * chain (utils/hashChain.js), so the AI assessment becomes part of the
 * immutable audit record.
 */

const Report = require('../models/Report');
const { getAiScamAssessment } = require('../utils/aiServiceClient');
const { appendToChain } = require('../utils/hashChain');

/**
 * POST /api/reports
 * Creates a new scam report, enriches it with an advisory AI assessment,
 * then commits it to the hash chain.
 */
async function createReport(req, res, next) {
  try {
    const {
      reporterId,
      scammerNumber,
      channel,
      reportText,
      evidenceImageBase64,
    } = req.body;

    if (!reportText && !evidenceImageBase64) {
      return res.status(400).json({
        error: 'A report must include reportText and/or evidenceImageBase64.',
      });
    }
    // 1. Call the AI microservice for an advisory scam-probability score.
   const aiFlag = await getAiScamAssessment({
      text: reportText,
      imageBase64: evidenceImageBase64,
      reportId: undefined,
    });

    // 2. Build the report document.
     const report = new Report({
      reporterId,
      scammerNumber,
      channel,
      reportText: reportText || null,
      hasEvidenceImage: Boolean(evidenceImageBase64),
      // Defensive default — never block persistence on a missing category.
      category: req.body.category || aiFlag?.category || 'UNKNOWN',
      status: 'pending_review',
      aiFlag,
      createdAt: new Date(),
    });

    await report.save();

    // 3. Append to the tamper-evident hash chain
  await appendToChain({
      entityType: 'Report',
      entityId: report._id.toString(),
      payload: report.toObject(),
    });

    return res.status(201).json({
      message: 'Report created successfully.',
      report,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/reports/analyze
 * Layer 1 instant preview — advisory only, does not create or persist a
 * report. Forwards the raw aiFlag object (including `available`/`error`)
 * so the client can distinguish "verified safe" from "couldn't analyze".
 */
async function analyzeReportPreview(req, res, next) {
  try {
    const { text, imageBase64 } = req.body;
    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'text or imageBase64 is required.' });
    }
    const aiFlag = await getAiScamAssessment({ text, imageBase64 });
    return res.status(200).json(aiFlag);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createReport, analyzeReportPreview };