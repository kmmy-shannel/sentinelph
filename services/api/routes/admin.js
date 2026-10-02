// services/api/routes/admin.js
const express = require('express');
const crypto = require('crypto');
const { initFirebase } = require('../config/firebase');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const User = require('../models/User');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const AdminAiReview = require('../models/AdminAiReview');
const PasswordResetToken = require('../models/PasswordResetToken');
const { sendActivationEmail } = require('../utils/email');
const { PH_REGIONS, isValidRegion } = require('../../../shared/regions');

const router = express.Router();

const REQUIRED_FIELDS = ['email', 'fullName', 'badgeId', 'jurisdiction'];

// Invite activation links expire in 15 minutes, same as web forgot-password.
const ACTIVATION_TOKEN_TTL_MINUTES = 15;

// (Kept for the deprecated /ai-insights/:reportId/review endpoint below.)
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

// ─── Effective-category fallback chain ───────────────────────────────
// The citizen app always sends scamType = 'UNKNOWN' — real classification
// only happens inside the AI. Officer verdicts override the AI once
// 2-of-3 consensus is reached. This chain picks the best available label
// for display in the Admin "Top Scam Types" panel.
//
// Priority (highest first):
//   1. officerSubtypeAggregated   (2-of-3 officer correction, terminal)
//   2. officerSubtype             (single officer's verdict, in-flight)
//   3. aiFlag.subtype             (Level 2 AI classification)
//   4. aiFlag.label               (Level 1 AI tier)
//   5. category | scamType        (citizen-declared, usually UNKNOWN)
//   6. "UNCLASSIFIED"             (nothing is available)
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

router.use(verifyFirebaseToken);
router.use(requireRole('admin'));

// Firebase claims establish the role; MongoDB is the source of truth for the
// agency scope. This prevents a client from choosing another agency in a form.
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

function reportScope(profile, requestedRegion) {
  const scope = requestedRegion || profile.jurisdiction;
  if (!scope || scope === 'National / Regional') return {};
  return {
    $or: [
      { 'location.region': scope },
      { jurisdiction: scope },
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
  if (['likely_scam', 'malicious', 'otp phishing', 'bank impersonation', 'parcel/delivery', 'investment scam', "gov't impersonation", 'phishing_link', 'fake_prize_lottery', 'wrong_number_baiting', 'urgent_fine_toll', 'impersonation_family'].includes(value)) return 'scam';
  if (['likely_legitimate', 'legitimate', 'personal_conversational', 'two_factor_auth', 'appointment_reminder', 'delivery_tracking', 'bank_activity_alert'].includes(value)) return 'legitimate';
  return 'unknown';
}

// ─── Metrics: computed from officer verdicts (ground truth) ──────────
//
// The pipeline that writes to AdminAiReview is deprecated. The real
// ground-truth signal comes from officer votes, which land in
// `Report.officerSubtypeAggregated` after 2-of-3 consensus.
//
// To keep the UI functioning during the transition, we merge both
// sources: `AdminAiReview` docs (if any exist historically) AND
// officer-verdict reports. Rows are deduped by reportId.
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
    // Predicted = the AI's own subtype (or label as fallback) at submission
    const predicted = r.aiFlag?.subtype || r.aiFlag?.label || 'unavailable';
    // Actual = the 2-of-3 officer consensus
    const actual = r.officerSubtypeAggregated || 'unavailable';
    signals.push({
      reportId: r.reportId,
      predicted,
      actual,
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

/**
 * POST /api/v1/admin/invite-officer
 */
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

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MINUTES * 60 * 1000);

      await PasswordResetToken.deleteMany({ firebaseUid: firebaseUser.uid });
      await PasswordResetToken.create({
        firebaseUid: firebaseUser.uid,
        email: normalizedEmail,
        tokenHash,
        expiresAt,
        requestedIp: req.ip || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 200),
      });

      const webOrigin =
        process.env.CLIENT_ORIGIN_WEB ||
        process.env.PASSWORD_RESET_WEB_ORIGIN ||
        'http://localhost:5173';

      const activationLink = `${webOrigin.replace(/\/$/, '')}/reset-password?mode=activate&token=${rawToken}`;

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

/**
 * GET /api/v1/admin/officers
 */
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

/**
 * PATCH /api/v1/admin/officers/:id
 */
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

/** Live agency overview. */
router.get('/dashboard', async (req, res) => {
  try {
    const scope = reportScope(req.adminProfile);
    const since7d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const reportMatch = Object.keys(scope).length ? { $and: [scope, { createdAt: { $gte: since7d } }] } : { createdAt: { $gte: since7d } };

    const aiCandidateMatch = Object.keys(scope).length
      ? {
          $and: [
            scope,
            { 'aiFlag.available': true },
            { 'aiFlag.label': { $in: ['legitimate', 'grey_area', 'malicious', 'uncertain'] } },
          ],
        }
      : {
          'aiFlag.available': true,
          'aiFlag.label': { $in: ['legitimate', 'grey_area', 'malicious', 'uncertain'] },
        };

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
        { $sort: { reports: -1 } }, { $limit: 6 },
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

    // Officer-verdict reports for the metrics — combined with adminReviews.
    const officerVerdicts = await Report.find(
      Object.keys(scope).length
        ? { $and: [scope, { officerSubtypeAggregated: { $ne: null } }] }
        : { officerSubtypeAggregated: { $ne: null } }
    )
      .select('reportId aiFlag officerSubtypeAggregated officerSubtypeFinalizedAt resolvedAt createdAt')
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
        trend: trendRows.map((row) => ({ day: row._id, sms: row.reports, calls: 0 })),
        heatmap: regions.map((row) => ({ region: row._id || 'Unknown', reports: row.reports })),
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

router.get('/ai-insights', async (req, res) => {
  try {
    const scope = reportScope(req.adminProfile);
    const scopedMatch = Object.keys(scope).length
      ? { $and: [scope, { 'aiFlag.available': true }] }
      : { 'aiFlag.available': true };
    const since30d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const trendMatch = Object.keys(scope).length
      ? { $and: [scope, { createdAt: { $gte: since30d } }, { 'aiFlag.available': true }] }
      : { createdAt: { $gte: since30d }, 'aiFlag.available': true };

    const [analyzed, candidates, adminReviews, officerVerdicts, trendRows] = await Promise.all([
      Report.countDocuments(scopedMatch),
      Report.find(scopedMatch)
        .sort({ createdAt: -1 })
        .limit(100)
        .select('reportId reportedNumber aiFlag location jurisdiction createdAt status officerSubtypeAggregated officerSubtypeAgreement officerSubtypeFinalizedAt resolvedAt')
        .lean(),
      AdminAiReview.find({ agency: req.adminProfile.agency })
        .select('reportId originalLabel selectedLabel reviewedAt')
        .lean(),
      Report.find(
        Object.keys(scope).length
          ? { $and: [scope, { officerSubtypeAggregated: { $ne: null } }] }
          : { officerSubtypeAggregated: { $ne: null } }
      )
        .select('reportId aiFlag officerSubtypeAggregated officerSubtypeFinalizedAt resolvedAt createdAt')
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

    // Ground-truth signal = officer verdicts (primary) + historical adminReviews
    const signals = buildReviewSignals(adminReviews, officerVerdicts);
    const modelMetrics = getModelMetrics(signals);
    const metricTrend = getMetricTrend(signals);

    // Per-report review lookup (officer verdict wins over admin review).
    const officerVerdictByReport = new Map();
    for (const r of officerVerdicts) {
      officerVerdictByReport.set(r.reportId, {
        verdict: r.officerSubtypeAggregated,
        agreement: r.officerSubtypeAgreement || 0,
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
        officerVerdict: officer?.verdict || null,
        officerAgreement: officer?.agreement || 0,
        officerFinalizedAt: officer?.finalizedAt || null,
        adminReview: adminReview
          ? { selectedLabel: adminReview.selectedLabel, reviewedAt: adminReview.reviewedAt }
          : null,
        agreementStatus,
      };
    });

    const pendingReview = items.filter((i) => i.agreementStatus === 'pending').length;
    const reviewed = items.filter((i) => i.agreementStatus !== 'pending').length;

    return res.json({
      success: true,
      data: {
        analyzed,
        pendingReview,
        reviewed,
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

// ─────────────────────────────────────────────────────────────────────
// DEPRECATED — POST /api/v1/admin/ai-insights/:reportId/review
//
// The admin-classification flow was removed by design: report review is
// the officer's job (they see the full evidence, they hold the domain
// expertise). This endpoint is retained for backward compatibility but
// is no longer called by any frontend. Remove once you're sure nothing
// depends on it.
// ─────────────────────────────────────────────────────────────────────
router.post('/ai-insights/:reportId/review', async (req, res) => {
  return res.status(410).json({
    success: false,
    error: 'ENDPOINT_DEPRECATED',
    message:
      'Admin classification of AI verdicts was removed. Report review is performed by officers through the Review Queue.',
  });
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