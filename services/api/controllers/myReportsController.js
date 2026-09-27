// services/api/controllers/myReportsController.js
'use strict';

const Report = require('../models/Report');
const { computeCitizenHash } = require('../utils/citizenHash');

// Statuses the citizen should see, mapped from the internal workflow
// state to the simplified four-stage lifecycle shown in the mobile app.
//   queued       → nobody has voted yet
//   under_review → 1 vote cast, waiting for the next
//   confirmed    → 2+ approvals, scam confirmed (number blacklisted
//                  OR impersonation scam message confirmed)
//   rejected     → 2+ rejections, report dismissed
function toCitizenStatus(report) {
  const s = report.status || 'pending';

  if (s === 'pending' || s === 'under_review') {
    // No votes yet → queued. (Some flows set 'under_review' on open,
    // so we still check approvals/rejections to distinguish.)
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

    // Only project the fields the mobile app needs for the status badge.
    // Never leak citizenHash, reporterName, or reporterEmail back.
    const rows = await Report.find({ citizenHash })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        'reportId status consensusState resolvedAt createdAt nullifier serverReportId'
      )
      .lean();

    const reports = rows.map((r) => ({
      reportId: r.reportId,
      nullifier: r.nullifier,
      reviewStatus: toCitizenStatus(r),
      internalStatus: r.status,
      approvals: r.consensusState?.approvals ?? 0,
      rejections: r.consensusState?.rejections ?? 0,
      required: r.consensusState?.required ?? 3,
      resolvedAt: r.resolvedAt || null,
      createdAt: r.createdAt,
    }));

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