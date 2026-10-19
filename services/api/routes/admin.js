// services/api/routes/admin.js
const express = require('express');
const { initFirebase } = require('../config/firebase');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const User = require('../models/User');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const AdminAiReview = require('../models/AdminAiReview');
const { sendActivationEmail } = require('../utils/email');
const { PH_REGIONS, isValidRegion } = require('../../../shared/regions');

const router = express.Router();

const REQUIRED_FIELDS = ['email', 'fullName', 'badgeId', 'jurisdiction'];

const AI_REVIEW_LABELS = [
  'OTP Phishing',
  'Bank Impersonation',
  'Parcel/Delivery',
  'Investment Scam',
  "Gov't Impersonation",
  'Likely scam',
  'Likely legitimate',
  'Uncertain',
  'Unknown',
];

const EFFECTIVE_CATEGORY_STAGE = {
  $ifNull: [
    '$officerSubtypeAggregated',
    {
      $ifNull: [
        '$officerSubtype',
        {
          $ifNull: [
            '$aiFlag.subtype',
            {
              $ifNull: [
                '$aiFlag.label',
                {
                  $ifNull: [
                    '$category',
                    { $ifNull: ['$scamType', 'UNCLASSIFIED'] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ─── 7-day trend helper ─────────────────────────────────────────────
function buildSevenDayTrend(rows = []) {
  const map = new Map();
  for (const r of rows) {
    if (r?._id) map.set(r._id, Number(r.reports) || 0);
  }

  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

    const label = new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
    }).format(d);

    out.push({ day: label, sms: map.get(key) ?? 0, calls: 0 });
  }
  return out;
}

// ─── Regional heatmap helper ────────────────────────────────────────
const FORCED_REGIONS = ['NCR', 'CAR', 'Region I', 'Region II'];

function buildHeatmap(rows = []) {
  const map = new Map();
  for (const r of rows) {
    if (r?._id) map.set(r._id, Number(r.reports) || 0);
  }

  const out = FORCED_REGIONS.map((region) => ({
    region,
    reports: map.get(region) ?? 0,
  }));

  return out.sort((a, b) => b.reports - a.reports);
}

router.use(verifyFirebaseToken);
router.use(requireRole('admin'));

router.use(async (req, res, next) => {
  try {
    const profile = await User.findOne({ firebaseUid: req.user.uid, role: 'admin' }).lean();
    if (!profile) {
      return res.status(403).json({
        success: false,
        error: 'ADMIN_PROFILE_REQUIRED',
        message: 'A valid Agency Admin profile is required for this request.',
      });
    }
    req.adminProfile = profile;
    return next();
  } catch (err) {
    return next(err);
  }
});

const UNSCOPED_REGIONS = ['UNCLASSIFIED', 'PH'];

function reportScope(profile, requestedRegion) {
  const scope = requestedRegion || profile.jurisdiction;
  if (!scope || scope === 'National / Regional') return {};

  return {
    $or: [
      { 'location.region': scope },
      { jurisdiction: scope },
      { 'location.region': { $in: UNSCOPED_REGIONS } },
      { 'location.region': null },
      { 'location.region': { $exists: false } },
    ],
  };
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (endOfDay) parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function auditAdminAction(req, action, metadata) {
  return AuditLog.record({
    userId: req.user.uid,
    role: 'admin',
    action,
    ipAddress: req.ip,
    metadata: { agency: req.adminProfile.agency, ...metadata },
  }).catch((err) => console.error(`[admin] audit failed for ${action}:`, err.message));
}

function normalizeAiLabel(label) {
  const value = String(label || '').trim().toLowerCase();
  if (!value) return 'unknown';

  const scamLabels = new Set([
    'malicious', 'likely_scam', 'scam',
    'phishing_link', 'fake_prize_lottery', 'wrong_number_baiting',
    'urgent_fine_toll', 'impersonation_family', 'brand_marketing',
    'otp phishing', 'bank impersonation', 'parcel/delivery',
    'investment scam', "gov't impersonation",
  ]);

  const legitLabels = new Set([
    'legitimate', 'likely_legitimate',
    'personal_conversational', 'two_factor_auth', 'appointment_reminder',
    'delivery_tracking', 'bank_activity_alert',
  ]);

  const greyLabels = new Set(['grey_area', 'uncertain']);

  if (scamLabels.has(value)) return 'scam';
  if (legitLabels.has(value)) return 'legitimate';
  if (greyLabels.has(value)) return 'grey_area';
  return 'unknown';
}

function predictedFromReport(report) {
  const ai = report.aiFlag || {};
  const label = ai.subtype || ai.label || null;
  if (label && label !== 'unavailable') return label;
  if (ai.riskLevel === 'HIGH') return 'malicious';
  if (ai.riskLevel === 'LOW') return 'legitimate';
  if (ai.riskLevel === 'MEDIUM') return 'grey_area';
  return 'unavailable';
}

function buildReviewSignals(adminReviews, officerVerdictReports) {
  const signals = [];
  const seen = new Set();

  for (const r of adminReviews || []) {
    if (!r.reportId || seen.has(r.reportId)) continue;
    seen.add(r.reportId);
    signals.push({
      reportId: r.reportId,
      predicted: r.originalLabel || 'unavailable',
      actual: r.selectedLabel || 'unavailable',
      reviewedAt: r.reviewedAt,
    });
  }

  for (const r of officerVerdictReports || []) {
    if (!r.reportId || seen.has(r.reportId)) continue;
    seen.add(r.reportId);
    signals.push({
      reportId: r.reportId,
      predicted: predictedFromReport(r),
      actual: r.officerSubtypeAggregated || r.officerTierAggregated || 'unavailable',
      reviewedAt: r.officerSubtypeFinalizedAt || r.resolvedAt || r.createdAt,
    });
  }

  return signals;
}

function getModelMetrics(signals) {
  const judged = signals
    .map((s) => ({
      predicted: normalizeAiLabel(s.predicted),
      actual: normalizeAiLabel(s.actual),
    }))
    .filter((s) => s.predicted !== 'unknown' && s.actual !== 'unknown');

  if (!judged.length) return null;

  const tp = judged.filter((i) => i.predicted === 'scam' && i.actual === 'scam').length;
  const fp = judged.filter((i) => i.predicted === 'scam' && i.actual !== 'scam').length;
  const fn = judged.filter((i) => i.predicted !== 'scam' && i.actual === 'scam').length;
  const accuracy = judged.filter((i) => i.predicted === i.actual).length / judged.length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall
    ? (2 * precision * recall) / (precision + recall)
    : null;

  return { accuracy, precision, recall, f1, sampleSize: judged.length };
}

function getMetricTrend(signals) {
  const ordered = [...signals]
    .filter((s) => s.reviewedAt)
    .sort((a, b) => new Date(a.reviewedAt) - new Date(b.reviewedAt));

  const history = [];
  for (let i = 0; i < ordered.length; i += 1) {
    const day = new Date(ordered[i].reviewedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    });
    const isLastForDay =
      i === ordered.length - 1 ||
      new Date(ordered[i + 1].reviewedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      }) !== day;
    if (!isLastForDay) continue;

    const metrics = getModelMetrics(ordered.slice(0, i + 1));
    if (metrics) {
      history.push({
        date: day,
        acc: metrics.accuracy * 100,
        prec: metrics.precision === null ? null : metrics.precision * 100,
        recall: metrics.recall === null ? null : metrics.recall * 100,
        f1: metrics.f1 === null ? null : metrics.f1 * 100,
      });
    }
  }
  return history;
}

function getAllowedDomains() {
  return (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function isDomainAllowed(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  if (domain.endsWith('.gov.ph') || domain === 'gov.ph') return true;
  return getAllowedDomains().includes(domain);
}

router.post(
  '/invite-officer',
  async (req, res) => {
    try {
      const { email, fullName, badgeId, jurisdiction } = req.body || {};
      const agency = req.adminProfile.agency;

      const missing = REQUIRED_FIELDS.filter((field) => !req.body?.[field] || !String(req.body[field]).trim());
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Missing required field(s): ${missing.join(', ')}.`,
        });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const normalizedJurisdiction = String(jurisdiction).trim();
      if (!isValidRegion(normalizedJurisdiction)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_JURISDICTION',
          message: `jurisdiction must be one of: ${PH_REGIONS.join(', ')}.`,
        });
      }

      if (!isDomainAllowed(normalizedEmail)) {
        return res.status(400).json({
          success: false,
          error: 'DOMAIN_NOT_ALLOWED',
          message: 'The email domain is not an approved .gov.ph domain or whitelisted domain.',
        });
      }

      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'USER_EXISTS',
          message: 'A user profile with this email already exists.',
        });
      }

      const admin = initFirebase();

      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUserByEmail(normalizedEmail);
      } catch (lookupErr) {
        if (lookupErr.code !== 'auth/user-not-found') throw lookupErr;
        firebaseUser = await admin.auth().createUser({
          email: normalizedEmail,
          displayName: fullName,
          emailVerified: true,
        });
      }

      await admin.auth().setCustomUserClaims(firebaseUser.uid, {
        role: 'officer',
        agency,
        jurisdiction: normalizedJurisdiction,
      });

      const webOrigin =
        process.env.CLIENT_ORIGIN_WEB ||
        process.env.PASSWORD_RESET_WEB_ORIGIN ||
        'http://localhost:5173';

      // Generate a valid Firebase OOB Code link
      const activationLink = await admin.auth().generatePasswordResetLink(
        normalizedEmail,
        {
          url: `${webOrigin.replace(/\/$/, '')}/activate?mode=resetPassword`,
          handleCodeInApp: true,
        }
      );

      const newUser = await User.create({
        firebaseUid: firebaseUser.uid,
        email: normalizedEmail,
        fullName,
        role: 'officer',
        badgeId,
        agency,
        jurisdiction: normalizedJurisdiction,
        status: 'pending_activation',
      });

      await auditAdminAction(req, 'OFFICER_INVITED', {
        targetUserId: newUser.firebaseUid,
        targetEmail: newUser.email,
        jurisdiction: newUser.jurisdiction,
      });

      try {
        await sendActivationEmail(normalizedEmail, fullName, agency, activationLink);
      } catch (mailErr) {
        console.error('[admin.invite-officer] Activation email failed to send:', mailErr);
        return res.status(201).json({
          success: true,
          warning: 'USER_CREATED_EMAIL_FAILED',
          message: 'User was provisioned, but the activation email could not be sent. Share the link manually.',
          activationLink,
          user: newUser.toSafeJSON(),
        });
      }

      return res.status(201).json({
        success: true,
        message: `Activation email sent to ${normalizedEmail}.`,
        user: newUser.toSafeJSON(),
      });
    } catch (err) {
      console.error('[admin.invite-officer] Unexpected error:', err);
      if (err.code === 'auth/email-already-exists') {
        return res.status(409).json({
          success: false,
          error: 'FIREBASE_USER_EXISTS',
          message: 'A Firebase account with this email already exists.',
        });
      }
      return res.status(500).json({
        success: false,
        error: 'INVITE_FAILED',
        message: 'Failed to provision the new officer account.',
      });
    }
  }
);

router.get('/officers', async (req, res) => {
  try {
    const officers = await User.find({ role: 'officer' })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      officers: officers.map((o) => ({
        _id: o._id,
        firebaseUid: o.firebaseUid,
        email: o.email,
        fullName: o.fullName,
        role: o.role,
        badgeId: o.badgeId,
        agency: o.agency,
        jurisdiction: o.jurisdiction,
        status: o.status,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
    });
  } catch (err) {
    console.error('[admin.officers] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'LIST_FAILED',
      message: 'Failed to list officers.',
    });
  }
});

router.get('/profile', async (req, res) => {
  const profile = req.adminProfile;
  return res.json({
    success: true,
    data: {
      id: profile._id,
      fullName: profile.fullName,
      email: profile.email,
      badgeId: profile.badgeId,
      agency: profile.agency,
      jurisdiction: profile.jurisdiction,
      role: profile.role,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    },
  });
});

router.patch('/officers/:id', async (req, res) => {
  try {
    const officer = await User.findOne({
      _id: req.params.id,
      role: 'officer',
      agency: req.adminProfile.agency,
    });
    if (!officer) {
      return res.status(404).json({ success: false, error: 'OFFICER_NOT_FOUND', message: 'Officer not found in your agency.' });
    }

    const nextStatus = req.body?.status;
    const nextJurisdiction = req.body?.jurisdiction;
    if (nextStatus && !['active', 'suspended', 'disabled'].includes(nextStatus)) {
      return res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'status must be active, suspended, or disabled.' });
    }
    if (nextJurisdiction && !isValidRegion(String(nextJurisdiction).trim())) {
      return res.status(400).json({ success: false, error: 'INVALID_JURISDICTION', message: `jurisdiction must be one of: ${PH_REGIONS.join(', ')}.` });
    }
    if (!nextStatus && !nextJurisdiction) {
      return res.status(400).json({ success: false, error: 'NO_CHANGES', message: 'Provide a status or jurisdiction to update.' });
    }

    const firebase = initFirebase();
    const firebaseUser = await firebase.auth().getUser(officer.firebaseUid);
    await firebase.auth().setCustomUserClaims(officer.firebaseUid, {
      ...(firebaseUser.customClaims || {}),
      role: 'officer',
      agency: officer.agency,
      jurisdiction: nextJurisdiction ? String(nextJurisdiction).trim() : officer.jurisdiction,
    });
    if (nextStatus) {
      await firebase.auth().updateUser(officer.firebaseUid, { disabled: nextStatus !== 'active' });
      if (nextStatus !== 'active') await firebase.auth().revokeRefreshTokens(officer.firebaseUid);
    }

    if (nextStatus) officer.status = nextStatus;
    if (nextJurisdiction) officer.jurisdiction = String(nextJurisdiction).trim();
    await officer.save();
    await auditAdminAction(req, 'OFFICER_UPDATED', {
      targetUserId: officer.firebaseUid,
      status: officer.status,
      jurisdiction: officer.jurisdiction,
    });

    return res.json({ success: true, user: officer.toSafeJSON() });
  } catch (err) {
    console.error('[admin.officer-update]', err);
    return res.status(500).json({ success: false, error: 'OFFICER_UPDATE_FAILED', message: 'Could not update the officer.' });
  }
});

const AI_PRESENT_FILTER = {
  $or: [
    { 'aiFlag.available': true },
    { 'aiFlag.subtype': { $ne: null } },
    {
      'aiFlag.label': {
        $in: ['legitimate', 'grey_area', 'malicious', 'likely_scam', 'uncertain', 'likely_legitimate'],
      },
    },
    { 'aiFlag.riskLevel': { $in: ['HIGH', 'MEDIUM', 'LOW'] } },
  ],
};

function scopedAiMatch(scope) {
  return Object.keys(scope).length
    ? { $and: [scope, AI_PRESENT_FILTER] }
    : AI_PRESENT_FILTER;
}

router.get('/dashboard', async (req, res) => {
  try {
    const scope = reportScope(req.adminProfile);
    const since7d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const reportMatch = Object.keys(scope).length ? { $and: [scope, { createdAt: { $gte: since7d } }] } : { createdAt: { $gte: since7d } };
    const aiCandidateMatch = scopedAiMatch(scope);

    const [totalReports, openReports, blacklisted, officers, trendRows, regions, categories, flagged, aiReviews] = await Promise.all([
      Report.countDocuments(scope),
      Report.countDocuments(Object.keys(scope).length ? { $and: [scope, { status: { $in: ['pending', 'under_review', 'one_approval', 'two_approvals'] } }] } : { status: { $in: ['pending', 'under_review', 'one_approval', 'two_approvals'] } }),
      Report.countDocuments(Object.keys(scope).length ? { $and: [scope, { status: { $in: ['blacklisted', 'approved'] } }] } : { status: { $in: ['blacklisted', 'approved'] } }),
      User.countDocuments({ role: 'officer', status: 'active' }),
      Report.aggregate([
        { $match: reportMatch },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Manila' } }, reports: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Report.aggregate([
        ...(Object.keys(scope).length ? [{ $match: scope }] : []),
        { $group: { _id: { $ifNull: ['$location.region', '$jurisdiction'] }, reports: { $sum: 1 } } },
        { $sort: { reports: -1 } }, { $limit: 20 },
      ]),
      Report.aggregate([
        ...(Object.keys(scope).length ? [{ $match: scope }] : []),
        {
          $group: {
            _id: EFFECTIVE_CATEGORY_STAGE,
            reports: { $sum: 1 },
          },
        },
        { $sort: { reports: -1 } }, { $limit: 5 },
      ]),
      Report.find(aiCandidateMatch)
        .sort({ createdAt: -1 })
        .limit(10)
        .select('reportId reportedNumber aiFlag location jurisdiction createdAt status officerSubtypeAggregated officerSubtypeAgreement officerSubtypeFinalizedAt')
        .lean(),
      AdminAiReview.find({ agency: req.adminProfile.agency }).select('reportId originalLabel selectedLabel reviewedAt').lean(),
    ]);

    const officerVerdicts = await Report.find(
      Object.keys(scope).length
        ? { $and: [scope, { officerSubtypeAggregated: { $ne: null } }] }
        : { officerSubtypeAggregated: { $ne: null } }
    )
      .select('reportId aiFlag officerSubtypeAggregated officerTierAggregated officerSubtypeFinalizedAt resolvedAt createdAt')
      .lean();

    const signals = buildReviewSignals(aiReviews, officerVerdicts);
    const modelMetrics = getModelMetrics(signals);

    const aiReviewIds = new Set(aiReviews.map((r) => r.reportId));
    const officerReviewedIds = new Set(officerVerdicts.map((r) => r.reportId));
    const reviewedIds = new Set([...aiReviewIds, ...officerReviewedIds]);

    return res.json({
      success: true,
      data: {
        scope: { agency: req.adminProfile.agency, jurisdiction: req.adminProfile.jurisdiction },
        kpis: {
          totalReports,
          aiModelAccuracy: modelMetrics?.accuracy ?? null,
          flaggedForReview: flagged.filter((r) => !reviewedIds.has(r.reportId)).length,
          scamTypesTracked: categories.length,
          openReports,
          blacklisted,
          activeOfficers: officers,
        },
        modelMetrics,
        trend: buildSevenDayTrend(trendRows),
        heatmap: buildHeatmap(regions),
        patterns: categories.map((row) => ({ category: row._id || 'UNCLASSIFIED', reports: row.reports })),
        flagged: flagged.map((report) => {
          const officerVerdict = report.officerSubtypeAggregated || null;
          const aiSubtype = report.aiFlag?.subtype || null;
          let agreementStatus = 'pending';
          if (officerVerdict) {
            agreementStatus = officerVerdict === aiSubtype ? 'confirmed' : 'corrected';
          }
          return {
            id: report.reportId,
            number: report.reportedNumber,
            label: report.aiFlag?.label || 'unavailable',
            subtype: aiSubtype,
            subtypeConfidence: report.aiFlag?.subtypeConfidence ?? null,
            confidence: report.aiFlag?.confidenceScore ?? report.aiFlag?.probabilityScore ?? null,
            riskLevel: report.aiFlag?.riskLevel || 'UNKNOWN',
            region: report.location?.region || report.jurisdiction || 'Unknown',
            status: report.status,
            officerVerdict,
            officerAgreement: report.officerSubtypeAgreement || 0,
            agreementStatus,
            reviewed: reviewedIds.has(report.reportId),
          };
        }),
      },
    });
  } catch (err) {
    console.error('[admin.dashboard]', err);
    return res.status(500).json({ success: false, error: 'DASHBOARD_FAILED', message: 'Could not load agency dashboard.' });
  }
});

async function backfillFinalizedAggregates(scope) {
  const finalizedStatuses = ['blacklisted', 'approved', 'rejected'];
  const baseFilter = {
    status: { $in: finalizedStatuses },
    officerTierAggregated: null,
  };
  const query = Object.keys(scope).length
    ? { $and: [scope, baseFilter] }
    : baseFilter;

  const reports = await Report.find(query)
    .select('_id reportId votes officerSubtypeFinalizedAt')
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();

  let repaired = 0;
  for (const report of reports) {
    try {
      const votes = Array.isArray(report.votes) ? report.votes : [];
      const result = Report.computeAggregatedClassification(votes);
      const decisiveVotes = Report.DECISIVE_VOTES || 2;
      const isAllRejected = votes.length >= decisiveVotes &&
        votes.every((vote) => vote.decision === 'reject');
      const finalTier = isAllRejected ? 'legitimate' : result.tier;

      const writeResult = await Report.collection.updateOne(
        {
          _id: report._id,
          status: { $in: finalizedStatuses },
          officerTierAggregated: null,
        },
        {
          $set: {
            officerSubtypeAggregated: result.subtype,
            officerSubtypeAgreement: result.subtypeAgreement,
            officerTierAggregated: finalTier,
            officerTierAgreement: result.tierAgreement,
            officerSubtypeFinalizedAt: report.officerSubtypeFinalizedAt || new Date(),
          },
        }
      );

      if (writeResult.matchedCount > 0) repaired += 1;
    } catch (err) {
      console.warn(`[admin.ai-insights] aggregate backfill failed for ${report.reportId}:`, err.message);
    }
  }

  return { repaired, scanned: reports.length };
}

router.get('/ai-insights', async (req, res) => {
  try {
    const scope = reportScope(req.adminProfile);
    const aggregationBackfill = await backfillFinalizedAggregates(scope);
    const scopedMatch = scopedAiMatch(scope);
    const since30d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const trendMatch = Object.keys(scope).length
      ? { $and: [scope, { createdAt: { $gte: since30d } }, AI_PRESENT_FILTER] }
      : { createdAt: { $gte: since30d }, ...AI_PRESENT_FILTER };

    const [analyzed, candidates, adminReviews, officerVerdicts, trendRows] = await Promise.all([
      Report.countDocuments(scopedMatch),
      Report.find(scopedMatch)
        .sort({ createdAt: -1 })
        .limit(100)
        .select('reportId reportedNumber aiFlag location jurisdiction createdAt status officerSubtypeAggregated officerTierAggregated officerSubtypeAgreement officerTierAgreement officerSubtypeFinalizedAt resolvedAt')
        .lean(),
      AdminAiReview.find({ agency: req.adminProfile.agency })
        .select('reportId originalLabel selectedLabel reviewedAt')
        .lean(),
      Report.find(
        Object.keys(scope).length
          ? { $and: [scope, { $or: [
              { officerSubtypeAggregated: { $ne: null } },
              { officerTierAggregated: { $ne: null } },
            ] }] }
          : { $or: [
              { officerSubtypeAggregated: { $ne: null } },
              { officerTierAggregated: { $ne: null } },
            ] }
      )
        .select('reportId aiFlag officerSubtypeAggregated officerTierAggregated officerSubtypeFinalizedAt resolvedAt createdAt')
        .lean(),
      Report.aggregate([
        { $match: trendMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%b %d', date: '$createdAt', timezone: 'Asia/Manila' } },
            analyzed: { $sum: 1 },
            uncertain: { $sum: { $cond: [{ $in: ['$aiFlag.label', ['uncertain', 'grey_area']] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const signals = buildReviewSignals(adminReviews, officerVerdicts);
    const modelMetrics = getModelMetrics(signals);
    const metricTrend = getMetricTrend(signals);

    const officerVerdictByReport = new Map();
    for (const r of officerVerdicts) {
      officerVerdictByReport.set(r.reportId, {
        verdict: r.officerSubtypeAggregated,
        tier: r.officerTierAggregated,
        agreement: r.officerSubtypeAgreement || 0,
        tierAgreement: r.officerTierAgreement || 0,
        finalizedAt: r.officerSubtypeFinalizedAt || r.resolvedAt || null,
      });
    }
    const adminReviewByReport = new Map(adminReviews.map((r) => [r.reportId, r]));

    const items = candidates.map((report) => {
      const aiSubtype = report.aiFlag?.subtype || null;
      const officer = officerVerdictByReport.get(report.reportId) || null;
      const adminReview = adminReviewByReport.get(report.reportId) || null;

      let agreementStatus = 'pending';
      if (officer?.verdict) {
        agreementStatus = officer.verdict === aiSubtype ? 'confirmed' : 'corrected';
      } else if (officer?.tier) {
        const officerTier = normalizeAiLabel(officer.tier);
        const aiTier = normalizeAiLabel(report.aiFlag?.label);
        const aiSubtypeTier = normalizeAiLabel(aiSubtype);
        agreementStatus = [aiTier, aiSubtypeTier].some(
          (label) => label !== 'unknown' && label === officerTier
        ) ? 'confirmed' : 'corrected';
      } else if (adminReview) {
        agreementStatus = 'admin-reviewed';
      }

      return {
        id: report.reportId,
        number: report.reportedNumber,
        region: report.location?.region || report.jurisdiction || 'Unknown',
        aiLabel: report.aiFlag?.label || 'unavailable',
        aiSubtype,
        aiSubtypeConfidence: report.aiFlag?.subtypeConfidence ?? null,
        aiConfidence: report.aiFlag?.confidenceScore ?? report.aiFlag?.probabilityScore ?? null,
        riskLevel: report.aiFlag?.riskLevel || 'UNKNOWN',
        status: report.status,
        officerVerdict: officer?.verdict || (officer?.tier
          ? `${officer.tier.charAt(0).toUpperCase()}${officer.tier.slice(1)}`
          : null),
        officerTier: officer?.tier || null,
        officerAgreement: officer?.verdict ? (officer.agreement || 0) : (officer?.tierAgreement || 0),
        officerTierAgreement: officer?.tierAgreement || 0,
        officerFinalizedAt: officer?.finalizedAt || null,
        adminReview: adminReview
          ? { selectedLabel: adminReview.selectedLabel, reviewedAt: adminReview.reviewedAt }
          : null,
        agreementStatus,
      };
    });

    const pendingReview = items.filter((i) => i.agreementStatus === 'pending').length;
    const reviewed = items.filter((i) => i.agreementStatus !== 'pending').length;
    const officerReviewed = items.filter(
      (i) => i.agreementStatus === 'confirmed' || i.agreementStatus === 'corrected'
    ).length;
    const adminReviewed = items.filter((i) => i.agreementStatus === 'admin-reviewed').length;

    return res.json({
      success: true,
      data: {
        analyzed,
        pendingReview,
        reviewed,
        officerReviewed,
        adminReviewed,
        aggregationBackfill,
        modelMetrics,
        metricTrend,
        items,
        trend: trendRows.map((row) => ({ date: row._id, analyzed: row.analyzed, uncertain: row.uncertain })),
      },
    });
  } catch (err) {
    console.error('[admin.ai-insights]', err);
    return res.status(500).json({ success: false, error: 'AI_INSIGHTS_FAILED', message: 'Could not load AI insights.' });
  }
});

router.post('/ai-insights/:reportId/review', async (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'ENDPOINT_DEPRECATED',
    message:
      'Admin classification of AI verdicts was removed. Report review is performed by officers through the Review Queue.',
  });
});

router.get('/reports/export', async (req, res) => {
  try {
    const { region, from, to, scamType, status, limit } = req.query;

    if (
      region &&
      req.adminProfile.jurisdiction !== 'National / Regional' &&
      region !== req.adminProfile.jurisdiction
    ) {
      return res.status(403).json({
        success: false,
        error: 'OUT_OF_SCOPE',
        message: 'You may only export reports in your assigned region.',
      });
    }

    const scope = reportScope(req.adminProfile, region || null);
    const filters = {};

    const start = parseDate(from);
    const end = parseDate(to, true);
    if ((from && !start) || (to && !end)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'Dates must be valid ISO dates.',
      });
    }
    if (start || end) {
      filters.createdAt = {
        ...(start ? { $gte: start } : {}),
        ...(end ? { $lte: end } : {}),
      };
    }

    if (scamType && scamType !== 'all') {
      filters.$or = [
        { officerSubtypeAggregated: scamType },
        { officerSubtype: scamType },
        { 'aiFlag.subtype': scamType },
        { 'aiFlag.label': scamType },
        { category: scamType },
        { scamType },
      ];
    }

    if (status && status !== 'all') {
      const validStatuses = [
        'pending',
        'under_review',
        'one_approval',
        'two_approvals',
        'blacklisted',
        'approved',
        'rejected',
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATUS',
          message: `status must be one of: ${validStatuses.join(', ')}.`,
        });
      }
      filters.status = status;
    }

    const query = Object.keys(scope).length
      ? { $and: [scope, filters] }
      : filters;

    const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 1000, 1), 5000);

    const docs = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(cappedLimit)
      .lean();

    const officerUids = new Set();
    for (const doc of docs) {
      for (const v of doc.votes || []) {
        if (v.userId) officerUids.add(v.userId);
      }
    }
    const officerDocs = officerUids.size
      ? await User.find(
          { firebaseUid: { $in: Array.from(officerUids) } },
          { firebaseUid: 1, fullName: 1, email: 1, badgeId: 1, agency: 1 }
        ).lean()
      : [];
    const officerByUid = new Map(officerDocs.map((o) => [o.firebaseUid, o]));

    const rows = docs.map((doc) => {
      const ai = doc.aiFlag || {};
      const loc = doc.location || {};

      const votes = (doc.votes || []).map((v) => {
        const officer = officerByUid.get(v.userId) || null;
        return {
          officerName: officer?.fullName || null,
          officerEmail: officer?.email || null,
          officerBadgeId: officer?.badgeId || null,
          userId: v.userId,
          decision: v.decision,
          comment: v.comment || '',
          votedAt: v.votedAt || null,
          editedAt: v.editedAt || null,
          subtypeAction: v.subtypeAction || null,
          correctedSubtype: v.correctedSubtype || null,
          isHighValue: Boolean(v.isHighValue),
          aiSubtypeAtVote: v.aiSubtypeAtVote || null,
        };
      });

      return {
        reportId: doc.reportId,
        sequence: doc.sequence,
        hash: doc.hash,
        createdAt: doc.createdAt,

        reporterName: doc.reporterShared ? doc.reporterName : null,
        reporterEmail: doc.reporterShared ? doc.reporterEmail : null,
        reporterShared: Boolean(doc.reporterShared),

        reportedNumber: doc.reportedNumber,
        channel: doc.channel || 'SMS',

        region: loc.region || doc.jurisdiction || 'Unknown',
        address: loc.address || null,
        lat: loc.lat ?? loc.latitude ?? null,
        lng: loc.lng ?? loc.longitude ?? null,

        textData: doc.textData || '',
        category: doc.category || 'UNKNOWN',
        scamType: doc.scamType || 'UNKNOWN',

        aiLabel: ai.label || 'unavailable',
        aiSubtype: ai.subtype || null,
        aiConfidence: ai.confidenceScore ?? ai.probabilityScore ?? null,
        aiSubtypeConfidence: ai.subtypeConfidence ?? null,
        aiRiskLevel: ai.riskLevel || 'UNKNOWN',
        aiModelVersion: ai.modelVersion || null,
        aiExplanationReasons: ai.explanationReasons || [],
        aiOcrUsed: Boolean(ai.ocrUsed),
        aiOcrText: ai.ocrText || null,

        status: doc.status,
        resolvedAt: doc.resolvedAt || null,
        votes,
        officerVerdict: doc.officerSubtypeAggregated || null,
        officerAgreement: doc.officerSubtypeAgreement || 0,
        officerFinalizedAt: doc.officerSubtypeFinalizedAt || null,
      };
    });

    return res.json({
      success: true,
      meta: {
        generatedAt: new Date().toISOString(),
        agency: req.adminProfile.agency,
        jurisdiction: req.adminProfile.jurisdiction,
        filters: { region, scamType, status, from, to },
        rowCount: rows.length,
        limit: cappedLimit,
      },
      data: rows,
    });
  } catch (err) {
    console.error('[admin.reports-export]', err);
    return res.status(500).json({
      success: false,
      error: 'REPORTS_EXPORT_FAILED',
      message: 'Could not generate the report export.',
    });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const { region, from, to, scamType } = req.query;
    if (region && req.adminProfile.jurisdiction !== 'National / Regional' && region !== req.adminProfile.jurisdiction) {
      return res.status(403).json({ success: false, error: 'OUT_OF_SCOPE', message: 'You may only request reports in your assigned region.' });
    }
    const scope = reportScope(req.adminProfile, region || null);
    const filters = {};
    const start = parseDate(from);
    const end = parseDate(to, true);
    if (from && !start || to && !end) return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'Dates must be valid ISO dates.' });
    if (start || end) filters.createdAt = { ...(start ? { $gte: start } : {}), ...(end ? { $lte: end } : {}) };
    if (scamType && scamType !== 'all') {
      filters.$or = [
        { officerSubtypeAggregated: scamType },
        { officerSubtype: scamType },
        { 'aiFlag.subtype': scamType },
        { 'aiFlag.label': scamType },
        { category: scamType },
        { scamType },
      ];
    }
    const query = Object.keys(scope).length ? { $and: [scope, filters] } : filters;
    const rows = await Report.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $ifNull: ['$location.region', '$jurisdiction'] },
          reports: { $sum: 1 },
          topScamType: { $last: EFFECTIVE_CATEGORY_STAGE },
          latestReportAt: { $max: '$createdAt' },
        },
      },
      { $sort: { reports: -1 } }, { $limit: 100 },
    ]);
    return res.json({
      success: true,
      data: rows.map((row) => ({
        region: row._id || 'Unknown',
        reports: row.reports,
        topScamType: row.topScamType || 'UNCLASSIFIED',
        latestReportAt: row.latestReportAt,
      })),
    });
  } catch (err) {
    console.error('[admin.reports]', err);
    return res.status(500).json({ success: false, error: 'REPORTS_FAILED', message: 'Could not generate the regional report.' });
  }
});

module.exports = router;