// services/api/controllers/reportReviewController.js
//
// Officer-facing review workflow for citizen reports:
//   GET  /api/v1/reports            -> listReports    (paginated, region-scoped)
//   GET  /api/v1/reports/:id        -> getReportById  (full detail incl. screenshot)
//   POST /api/v1/reports/:id/vote   -> voteOnReport   (CANONICAL Two-Officer vote)
//
// Report-level consensus is the single source of truth. When a report
// reaches 2 distinct approvals it becomes 'blacklisted' and the reported
// entity is upserted into the BlacklistEntry collection.
'use strict';

const mongoose = require('mongoose');

const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');
const AuditLog = require('../models/AuditLog');
const { ApiError } = require('../middleware/errorHandler');

const UNCLASSIFIED = 'UNCLASSIFIED';
// Region values that mean "not tied to one region". `PH` is the schema
// default for records created before region resolution existed.
const UNSCOPED_REGIONS = [UNCLASSIFIED, 'PH'];

const DEFAULT_PAGE_SIZE = 20; // matches the previous GET /reports default
const MAX_PAGE_SIZE = 100;
const BUCKETS = ['pending', 'resolved', 'all'];

// The list never carries the base64 screenshot (it can be megabytes per
// row) nor the pseudonymous citizen identifier. Screenshots are fetched
// one at a time through GET /:id when an officer opens a case.
//
// ─── REPORTER IDENTITY ────────────────────────────────────────────────────
// The `+reporterName +reporterEmail +reporterShared` prefixes override the
// schema-level `select: false` on those fields, so officers SEE the
// reporter identity while every other consumer (public blacklist,
// citizen's own-report list, exports) continues to hide it.
// Pure exclusion mode. Reporter identity is included by default (schema
// no longer marks it select:false); citizenHash is excluded here so no
// officer response ever leaks the pseudonymous identifier.
const LIST_SELECT = '-evidenceImage -citizenHash';
const DETAIL_SELECT = '-citizenHash';
// ──────────────────────────────────────────────────────────────────────────

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

/**
 * Region scope for list queries (Phase 1 region-scoped visibility).
 * Officers see ONLY their assigned region's reports, PLUS reports the
 * mobile client couldn't geolocate (UNCLASSIFIED / no region), so no
 * report is ever invisible to the queue. An officer with no jurisdiction
 * claim is rejected loudly rather than shown an empty queue.
 * Analyst / auditor may filter to one region on demand.
 *
 * Every query-string value is coerced with String() so a crafted
 * `?region[$ne]=x` cannot smuggle a Mongo operator into the filter.
 */
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

/**
 * Route middleware: resolves :id to a report and stashes the minimal
 * scope data on req.reportScope, so requireJurisdictionMatch() can compare
 * the officer's jurisdiction against the report's WITHOUT loading the
 * (potentially huge) evidence payload.
 */
async function attachReport(req, res, next) {
  try {
    const scope = await Report.findOne(buildIdQuery(req.params.id))
      .select('reportId jurisdiction location.region status')
      .lean();

    if (!scope) {
      throw new ApiError(404, `No report found with reportId "${req.params.id}".`, 'NOT_FOUND');
    }

    // Same stance as the list route: an officer without a region claim is a
    // misconfigured account, not an unrestricted one.
    if (req.user && req.user.role === 'officer' && !req.user.jurisdiction) {
      throw new ApiError(403, MISSING_JURISDICTION_MESSAGE, 'MISSING_JURISDICTION');
    }

    req.reportScope = scope;
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Resolver for requireJurisdictionMatch(). Returns null for unscoped
 * reports so the guard lets any officer act on them (the guard treats a
 * missing resource jurisdiction as "no restriction"). This also fixes the
 * old inconsistency where UNCLASSIFIED reports were VISIBLE in the queue
 * but returned 403 on vote/detail.
 */
function getReportJurisdiction(req) {
  const scope = req.reportScope;
  if (!scope) return null;

  const region = (scope.location && scope.location.region) || scope.jurisdiction || null;
  if (!region || UNSCOPED_REGIONS.includes(region)) return null;
  return region;
}

/**
 * GET /api/v1/reports?page=1&limit=20&bucket=pending|resolved|all
 *                    &status=<exact status>&reportedNumber=<n>&region=<r>
 *
 * Response (both `data` and `reports` are kept for existing consumers):
 *   {
 *     success: true,
 *     data: [...], reports: [...],
 *     pagination: { page, limit, total, totalPages, hasMore },
 *     counts: { pending, resolved, all }   // for the caller's region scope
 *   }
 */
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

/**
 * GET /api/v1/reports/:id
 * Full report (including the base64 screenshot) for the vote modal.
 * Mount AFTER attachReport + requireJurisdictionMatch(getReportJurisdiction).
 * Response keeps the existing `{ success, data }` contract.
 */
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

/**
 * POST /api/v1/reports/:id/vote   body: { decision: 'approve'|'reject', comment }
 *
 * CANONICAL voting entry point. Mount AFTER verifyFirebaseToken,
 * requireRole('officer'), attachReport and
 * requireJurisdictionMatch(getReportJurisdiction).
 *
 * The vote, the consensus counters and the status transition happen in one
 * atomic update (Report.castVote). If that transition lands on
 * 'blacklisted', the reported entity is then upserted into BlacklistEntry
 * (idempotent, safe to repeat). Every vote is written to the AuditLog.
 */
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
        // The vote itself is already committed and cannot be rolled back
        // (append-only chain). Surface the failure so it can be reconciled
        // by re-running BlacklistEntry.upsertFromReport() for this report.
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

    // The vote is already committed; a failing audit write must not turn a
    // successful vote into a 500 (which would invite a duplicate retry).
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
      ...payload, // flat fields for the web ReviewQueue
      data: payload, // existing `{ success, data }` envelope
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
};