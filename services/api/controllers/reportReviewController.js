// services/api/controllers/reportReviewController.js
//
// Officer-facing review workflow for citizen reports:
//   GET   /api/v1/reports            -> listReports    (paginated, region-scoped)
//   GET   /api/v1/reports/:id        -> getReportById  (full detail incl. screenshot)
//   POST  /api/v1/reports/:id/vote   -> voteOnReport   (CANONICAL 3-officer vote)
//   PATCH /api/v1/reports/:id/vote   -> changeVoteOnReport (edit an existing vote)
'use strict';

const mongoose = require('mongoose');

const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const AuditLog = require('../models/AuditLog');
const { ApiError } = require('../middleware/errorHandler');

const UNCLASSIFIED = 'UNCLASSIFIED';
const UNSCOPED_REGIONS = [UNCLASSIFIED, 'PH'];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const BUCKETS = ['pending', 'resolved', 'all'];

// The list never carries the base64 screenshot (it can be megabytes per
// row) nor the pseudonymous citizen identifier. Reporter identity is
// included by default; citizenHash is excluded here so no officer
// response ever leaks the pseudonymous identifier.
const LIST_SELECT = '-evidenceImage -citizenHash';
const DETAIL_SELECT = '-citizenHash';

const MISSING_JURISDICTION_MESSAGE =
  'Your account is not assigned to a region. Contact the NBI admin.';

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function buildIdQuery(rawId) {
  const value = String(rawId || '').trim();
  if (/^[a-fA-F0-9]{24}$/.test(value) && mongoose.Types.ObjectId.isValid(value)) {
    return { $or: [{ reportId: value }, { _id: value }] };
  }
  return { reportId: value };
}

function buildScopeFilter(req) {
  const user = req.user || {};

  if (user.role === 'officer') {
    if (!user.jurisdiction) {
      throw new ApiError(403, MISSING_JURISDICTION_MESSAGE, 'MISSING_JURISDICTION');
    }
    if (req.query.region && String(req.query.region) !== user.jurisdiction) {
      throw new ApiError(
        403,
        'Officers may only query reports within their assigned jurisdiction.',
        'JURISDICTION_MISMATCH'
      );
    }
    return {
      $or: [
        { 'location.region': user.jurisdiction },
        { 'location.region': UNCLASSIFIED },
        { 'location.region': null },
        { 'location.region': { $exists: false } },
      ],
    };
  }

  if (req.query.region) {
    return { 'location.region': String(req.query.region) };
  }
  return {};
}

async function attachReport(req, res, next) {
  try {
    const scope = await Report.findOne(buildIdQuery(req.params.id))
      .select('reportId jurisdiction location.region status')
      .lean();

    if (!scope) {
      throw new ApiError(404, `No report found with reportId "${req.params.id}".`, 'NOT_FOUND');
    }

    if (req.user && req.user.role === 'officer' && !req.user.jurisdiction) {
      throw new ApiError(403, MISSING_JURISDICTION_MESSAGE, 'MISSING_JURISDICTION');
    }

    req.reportScope = scope;
    return next();
  } catch (err) {
    return next(err);
  }
}

function getReportJurisdiction(req) {
  const scope = req.reportScope;
  if (!scope) return null;

  const region = (scope.location && scope.location.region) || scope.jurisdiction || null;
  if (!region || UNSCOPED_REGIONS.includes(region)) return null;
  return region;
}

async function listReports(req, res, next) {
  try {
    const page = clampInt(req.query.page, 1, 1, 1000000);
    const limit = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const bucket = BUCKETS.includes(req.query.bucket) ? req.query.bucket : 'all';

    const scope = buildScopeFilter(req);
    const filter = { ...scope };

    if (req.query.status) {
      filter.status = String(req.query.status).toLowerCase();
    } else if (bucket === 'pending') {
      filter.status = { $in: Report.OPEN_STATUSES };
    } else if (bucket === 'resolved') {
      filter.status = { $in: Report.RESOLVED_STATUSES };
    }

    if (req.query.reportedNumber) {
      filter.reportedNumber = String(req.query.reportedNumber);
    }

    const [total, rows, pendingCount, resolvedCount, allCount] = await Promise.all([
      Report.countDocuments(filter),
      Report.find(filter)
        .select(LIST_SELECT)
        .sort({ sequence: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Report.countDocuments({ ...scope, status: { $in: Report.OPEN_STATUSES } }),
      Report.countDocuments({ ...scope, status: { $in: Report.RESOLVED_STATUSES } }),
      Report.countDocuments(scope),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      success: true,
      data: rows,
      reports: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
      counts: {
        pending: pendingCount,
        resolved: resolvedCount,
        all: allCount,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getReportById(req, res, next) {
  try {
    const query = req.reportScope
      ? { reportId: req.reportScope.reportId }
      : buildIdQuery(req.params.id);

    const report = await Report.findOne(query).select(DETAIL_SELECT).lean();
    if (!report) {
      throw new ApiError(404, `No report found with reportId "${req.params.id}".`, 'NOT_FOUND');
    }

    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    return next(err);
  }
}

async function voteOnReport(req, res, next) {
  try {
    const userId = req.user && req.user.uid;
    if (!userId) {
      throw new ApiError(401, 'Authentication is required to vote.', 'UNAUTHORIZED');
    }

    const { decision, comment } = req.body || {};

    if (!['approve', 'reject'].includes(decision)) {
      throw new ApiError(400, "decision must be 'approve' or 'reject'.", 'VALIDATION_ERROR');
    }
    if (typeof comment !== 'string' || comment.trim().length === 0) {
      throw new ApiError(400, 'comment is required and must be non-empty.', 'VALIDATION_ERROR');
    }

    const reportId = (req.reportScope && req.reportScope.reportId) || String(req.params.id || '');

    let updated;
    try {
      updated = await Report.castVote(reportId, {
        userId,
        role: req.user.role || 'officer',
        decision,
        comment: comment.trim(),
      });
    } catch (voteErr) {
      if (voteErr && voteErr.statusCode) {
        throw new ApiError(voteErr.statusCode, voteErr.message, voteErr.code || 'VOTE_REJECTED');
      }
      throw voteErr;
    }

    let blacklistEntry = null;
    let blacklistSynced = null;

    if (updated.status === 'blacklisted') {
      try {
        blacklistEntry = await BlacklistEntry.upsertFromReport(updated);
        blacklistSynced = true;
      } catch (syncErr) {
        blacklistSynced = false;
        console.error(
          `[reportReviewController] report ${updated.reportId} reached consensus but the ` +
            `BlacklistEntry upsert failed:`,
          syncErr && syncErr.message
        );
      }
    }

    const consensus = updated.consensusState || {};
    const approvals = consensus.approvals ?? 0;
    const rejections = consensus.rejections ?? 0;

    try {
      await AuditLog.record({
        userId,
        role: req.user.role,
        action: decision === 'approve' ? 'REPORT_APPROVED' : 'REPORT_REJECTED',
        ipAddress: req.ip,
        metadata: {
          reportId: updated.reportId,
          decision,
          approvals,
          rejections,
          resultingStatus: updated.status,
          blacklisted: updated.status === 'blacklisted',
          blacklistSynced,
        },
      });
    } catch (auditErr) {
      console.error(
        `[reportReviewController] audit write failed for vote on ${updated.reportId}:`,
        auditErr && auditErr.message
      );
    }

    const payload = {
      reportId: updated.reportId,
      status: updated.status,
      consensusState: {
        approvals,
        rejections,
        required: consensus.required ?? Report.CONSENSUS_REQUIRED,
      },
      votesCount: Array.isArray(updated.votes) ? updated.votes.length : 0,
      blacklisted: updated.status === 'blacklisted',
      blacklistSynced,
      blacklistEntry: blacklistEntry
        ? {
            phoneNumber: blacklistEntry.phoneNumber,
            status: blacklistEntry.status,
            approvingOfficers: blacklistEntry.approvingOfficers,
            hash: blacklistEntry.hash,
            reportCount: blacklistEntry.reportCount,
          }
        : null,
    };

    return res.status(200).json({
      success: true,
      message:
        payload.blacklisted
          ? 'Vote recorded. Two-officer consensus reached — the number was added to the blacklist.'
          : 'Vote recorded.',
      ...payload,
      data: payload,
    });
  } catch (err) {
    return next(err);
  }
}

async function changeVoteOnReport(req, res, next) {
  try {
    const userId = req.user && req.user.uid;
    if (!userId) {
      throw new ApiError(401, 'Authentication is required to edit a vote.', 'UNAUTHORIZED');
    }

    const { decision, comment } = req.body || {};

    if (!['approve', 'reject'].includes(decision)) {
      throw new ApiError(400, "decision must be 'approve' or 'reject'.", 'VALIDATION_ERROR');
    }
    if (typeof comment !== 'string' || comment.trim().length === 0) {
      throw new ApiError(400, 'comment is required and must be non-empty.', 'VALIDATION_ERROR');
    }

    const reportId = (req.reportScope && req.reportScope.reportId) || String(req.params.id || '');

    let result;
    try {
      result = await Report.changeVote(reportId, {
        userId,
        decision,
        comment: comment.trim(),
      });
    } catch (editErr) {
      if (editErr && editErr.statusCode) {
        throw new ApiError(editErr.statusCode, editErr.message, editErr.code || 'VOTE_EDIT_REJECTED');
      }
      throw editErr;
    }

    const { updated, previous } = result;
    const consensus = updated.consensusState || {};
    const approvals = consensus.approvals ?? 0;
    const rejections = consensus.rejections ?? 0;

    try {
      await AuditLog.record({
        userId,
        role: req.user.role,
        action: 'VOTE_EDITED',
        ipAddress: req.ip,
        metadata: {
          reportId: updated.reportId,
          previous: {
            decision: previous.decision,
            comment: previous.comment,
            votedAt: previous.votedAt,
            editedAt: previous.editedAt,
          },
          next: {
            decision,
            comment: comment.trim(),
            editedAt: new Date(),
          },
          approvals,
          rejections,
          resultingStatus: updated.status,
        },
      });
    } catch (auditErr) {
      console.error(
        `[reportReviewController] audit write failed for vote edit on ${updated.reportId}:`,
        auditErr && auditErr.message
      );
    }

    const payload = {
      reportId: updated.reportId,
      status: updated.status,
      consensusState: {
        approvals,
        rejections,
        required: consensus.required ?? Report.CONSENSUS_REQUIRED,
      },
      votesCount: Array.isArray(updated.votes) ? updated.votes.length : 0,
      previous,
    };

    return res.status(200).json({
      success: true,
      message: 'Vote updated.',
      ...payload,
      data: payload,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  attachReport,
  getReportJurisdiction,
  listReports,
  getReportById,
  voteOnReport,
  changeVoteOnReport,
};