// services/api/controllers/myReportsController.js
'use strict';

const Report = require('../models/Report');
const { computeCitizenHash } = require('../utils/citizenHash');

function toCitizenStatus(report) {
  const s = report.status || 'pending';

  if (s === 'pending' || s === 'under_review') {
    const approvals = report.consensusState?.approvals ?? 0;
    const rejections = report.consensusState?.rejections ?? 0;
    if (approvals + rejections === 0) return 'queued';
    return 'under_review';
  }
  if (s === 'one_approval' || s === 'two_approvals') return 'under_review';
  if (s === 'blacklisted' || s === 'approved') return 'confirmed';
  if (s === 'rejected') return 'rejected';
  return 'queued';
}

async function listMyReports(req, res, next) {
  try {
    const citizenHash = computeCitizenHash(req);
    if (!citizenHash) {
      return res.status(401).json({
        error: 'IDENTITY_REQUIRED',
        message: 'Sign in to fetch your reports.',
      });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

    const rows = await Report.find({ citizenHash })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        [
          'reportId',
          'status',
          'consensusState',
          'resolvedAt',
          'createdAt',
          'nullifier',
          'targetKind',
          'brandName',
          'reportedNumber',
          'sender',
          'scamType',
          'category',
          'content',
          'textData',
          'location',
          'jurisdiction',
          'aiFlag',
          'evidenceImage',
          'hasEvidenceImage',
          'officerVerifiedAt',
          'officerSubtype',
          'officerSubtypeAction',
          'officerDecision',
          'officerSubtypeAggregated',
          'officerSubtypeAgreement',
          'officerSubtypeFinalizedAt',
        ].join(' ')
      )
      .lean();

    const reports = rows.map((r) => {
      const ai = r.aiFlag || {};
      const aiFlag = {
        available: ai.available !== false,
        probabilityScore:
          typeof ai.probabilityScore === 'number' ? ai.probabilityScore : null,
        confidenceScore:
          typeof ai.confidenceScore === 'number' ? ai.confidenceScore : null,
        label: ai.label || null,
        subtype: ai.subtype || null,
        subtypeConfidence:
          typeof ai.subtypeConfidence === 'number'
            ? ai.subtypeConfidence
            : null,
        subtypeModelVersion: ai.subtypeModelVersion || null,
        riskLevel: ai.riskLevel || 'UNKNOWN',
        isScam: ai.isScam ?? null,
        explanationReasons: Array.isArray(ai.explanationReasons)
          ? ai.explanationReasons
          : [],
        ocrText: ai.ocrText || null,
        modelVersion: ai.modelVersion || null,
      };

      const content =
        (typeof r.content === 'string' && r.content.length > 0
          ? r.content
          : null) ||
        (typeof r.textData === 'string' && r.textData.length > 0
          ? r.textData
          : null) ||
        null;

      const region =
        (r.location && typeof r.location.region === 'string'
          ? r.location.region
          : null) ||
        r.jurisdiction ||
        null;

      const reportedNumber = r.reportedNumber || r.sender || null;

      return {
        reportId: r.reportId,
        nullifier: r.nullifier,

        // Target kind
        targetKind: r.targetKind || 'number',
        brandName: r.brandName || null,

        // Status badge
        reviewStatus: toCitizenStatus(r),
        internalStatus: r.status,
        approvals: r.consensusState?.approvals ?? 0,
        rejections: r.consensusState?.rejections ?? 0,
        required: r.consensusState?.required ?? 3,
        resolvedAt: r.resolvedAt || null,
        createdAt: r.createdAt,

        // Render fields
        reportedNumber,
        content,
        scamType: r.scamType || r.category || 'UNKNOWN',
        region,
        location: r.location || null,
        jurisdiction: r.jurisdiction || null,

        // AI verdict
        aiFlag,

        // Officer verdict
        officerVerifiedAt: r.officerVerifiedAt || null,
        officerSubtype: r.officerSubtype || null,
        officerSubtypeAction: r.officerSubtypeAction || null,
        officerDecision: r.officerDecision || null,
        officerSubtypeAggregated: r.officerSubtypeAggregated || null,
        officerSubtypeAgreement:
          typeof r.officerSubtypeAgreement === 'number'
            ? r.officerSubtypeAgreement
            : 0,
        officerSubtypeFinalizedAt: r.officerSubtypeFinalizedAt || null,

        // Evidence
        evidenceImage: r.evidenceImage || null,
        hasEvidenceImage: Boolean(r.hasEvidenceImage),
      };
    });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listMyReports, toCitizenStatus };