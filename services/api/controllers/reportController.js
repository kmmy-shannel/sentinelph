/**
 * services/api/controllers/reportController.js
 * -----------------------------------------------
 * Integration snippet: calling the AI Scam Detection microservice
 * during report ingestion, BEFORE the report is appended to the hash
 * chain (utils/hashChain.js), so the AI assessment becomes part of the
 * immutable audit record.
 *
 * This is a focused snippet showing where/how `aiServiceClient` plugs
 * into your existing controller — merge it into your real
 * reportController.js alongside your existing imports, validation,
 * auth, and error-handling middleware (auth.js, errorHandler.js,
 * rateLimiter.js already in your controllers/middleware layer).
 *
 * GUARDRAIL REMINDER (SRS Requirement 5): `aiFlag` below is stored as
 * metadata ONLY. It never triggers a BlacklistEntry write directly.
 * Blacklisting still requires the existing Two-Officer approval flow
 * (see your auditor.js / rbac.js routes) — the AI's label/score is
 * simply additional context an officer sees when reviewing the report.
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
      channel, // e.g. 'sms', 'call', 'email', 'social'
      reportText,
      evidenceImageBase64, // optional screenshot, base64-encoded
    } = req.body;

    if (!reportText && !evidenceImageBase64) {
      return res.status(400).json({
        error: 'A report must include reportText and/or evidenceImageBase64.',
      });
    }

    // 1. Call the AI microservice for an advisory scam-probability score.
    //    This call is fault-tolerant: if the AI service is offline, we
    //    still proceed with report creation using a fallback aiFlag so
    //    the civic-tech pipeline never blocks on a downstream ML outage.
    const aiFlag = await getAiScamAssessment({
      text: reportText,
      imageBase64: evidenceImageBase64,
      reportId: undefined, // Mongo _id doesn't exist yet at this point
    });

    // 2. Build the report document. `aiFlag` is stored as read-only
    //    metadata alongside the human-submitted content.
    const report = new Report({
      reporterId,
      scammerNumber,
      channel,
      reportText: reportText || null,
      hasEvidenceImage: Boolean(evidenceImageBase64),
      status: 'pending_review', // Two-Officer state machine starts here
      aiFlag, // { available, probabilityScore, label, ocrUsed, modelVersion, advisoryOnly, checkedAt, error }
      createdAt: new Date(),
    });

    await report.save();

    // 3. Append to the tamper-evident hash chain AFTER the AI flag is
    //    attached, so the chain captures exactly what officers will see,
    //    including the AI's (advisory-only) assessment at submission time.
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
    return next(err); // delegated to middleware/errorHandler.js
  }
}

module.exports = { createReport };