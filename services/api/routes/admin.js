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
  if (['likely_scam', 'malicious', 'otp phishing', 'bank impersonation', 'parcel/delivery', 'investment scam', "gov't impersonation"].includes(value)) return 'scam';
  if (['likely_legitimate', 'legitimate'].includes(value)) return 'legitimate';
  return 'unknown';
}

function getModelMetrics(reviews) {
  const judged = reviews
    .map((review) => ({ predicted: normalizeAiLabel(review.originalLabel), actual: normalizeAiLabel(review.selectedLabel) }))
    .filter((review) => review.predicted !== 'unknown' && review.actual !== 'unknown');
  if (!judged.length) return null;
  const tp = judged.filter((item) => item.predicted === 'scam' && item.actual === 'scam').length;
  const fp = judged.filter((item) => item.predicted === 'scam' && item.actual !== 'scam').length;
  const fn = judged.filter((item) => item.predicted !== 'scam' && item.actual === 'scam').length;
  const accuracy = judged.filter((item) => item.predicted === item.actual).length / judged.length;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision !== null && recall !== null && precision + recall ? (2 * precision * recall) / (precision + recall) : null;
  return { accuracy, precision, recall, f1, sampleSize: judged.length };
}

function getMetricTrend(reviews) {
  const ordered = [...reviews].filter((review) => review.reviewedAt).sort((a, b) => new Date(a.reviewedAt) - new Date(b.reviewedAt));
  const history = [];
  let currentDay = null;
  for (let index = 0; index < ordered.length; index += 1) {
    const day = new Date(ordered[index].reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const isLastForDay = index === ordered.length - 1 || new Date(ordered[index + 1].reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) !== day;
    currentDay = day;
    if (!isLastForDay) continue;
    const metrics = getModelMetrics(ordered.slice(0, index + 1));
    if (metrics) history.push({ date: currentDay, acc: metrics.accuracy * 100, prec: metrics.precision === null ? null : metrics.precision * 100, recall: metrics.recall === null ? null : metrics.recall * 100, f1: metrics.f1 === null ? null : metrics.f1 * 100 });
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

  // Always allow any subdomain of .gov.ph (e.g. pnp.gov.ph, ndrrmc.gov.ph)
  if (domain.endsWith('.gov.ph') || domain === 'gov.ph') {
    return true;
  }

  const allowedDomains = getAllowedDomains();
  return allowedDomains.includes(domain);
}

/**
 * POST /api/v1/admin/invite-officer
 * Restricted to admin / superadmin. Provisions a passwordless Firebase
 * account, saves a pending_activation profile in MongoDB, and emails the
 * invitee a single-use activation link pointing at our own ResetPassword
 * page with ?mode=activate.
 *
 * Uses the same custom-token system as /auth/request-password-reset so
 * the frontend's confirm-password-reset handler needs no changes.
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

      // Region whitelist — must be one of the canonical Roman-numeral
      // names in shared/regions.js.
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

      // Fetch or create the Firebase Auth account.
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().getUserByEmail(normalizedEmail);
      } catch (lookupErr) {
        if (lookupErr.code !== 'auth/user-not-found') {
          throw lookupErr;
        }
        firebaseUser = await admin.auth().createUser({
          email: normalizedEmail,
          displayName: fullName,
          emailVerified: true,
        });
      }

      // Tag the new officer with a role claim so verifyFirebaseToken
      // recognizes them once they authenticate.
      await admin.auth().setCustomUserClaims(firebaseUser.uid, {
        role: 'officer',
        agency,
        jurisdiction: normalizedJurisdiction,
      });

      // ─── Build a custom activation link (NOT a Firebase link) ────────
      // Same token mechanics as /auth/request-password-reset:
      //   • 32-byte random token emailed to the officer
      //   • sha256(token) stored in PasswordResetToken
      //   • confirm-password-reset verifies the hash and updates the
      //     Firebase password — no changes needed on that endpoint.
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      const expiresAt = new Date(
        Date.now() + ACTIVATION_TOKEN_TTL_MINUTES * 60 * 1000
      );

      // One live token per user — clear any stale invite/reset tokens.
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
      // ─────────────────────────────────────────────────────────────────

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
 * Lists all officer-role users (across every region), sorted newest first.
 * Restricted to admin/superadmin.
 */
router.get(
  '/officers',
  async (req, res) => {
    try {
      // Agency Admins were explicitly configured to monitor every registered
      // officer, including officers from other agencies.
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
  }
);

// Admin-only equivalent of /auth/me. Keeping this inside the Admin API means
// each Admin screen reads its data through one consistent endpoint family.
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
 * An Agency Admin may only change an officer within the Admin's own agency.
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
      // Suspending or disabling access takes effect at Firebase too; revoking
      // refresh tokens prevents the old web session from silently persisting.
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

/** Live agency overview. Counts only reports in the Admin's assigned region;
 * a National / Regional Admin receives a national view. */
router.get('/dashboard', async (req, res) => {
  try {
    const scope = reportScope(req.adminProfile);
    const since7d = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const reportMatch = Object.keys(scope).length ? { $and: [scope, { createdAt: { $gte: since7d } }] } : { createdAt: { $gte: since7d } };
    const aiCandidateMatch = Object.keys(scope).length
      ? { $and: [scope, { 'aiFlag.label': { $in: ['uncertain', 'grey_area'] } }] }
      : { 'aiFlag.label': { $in: ['uncertain', 'grey_area'] } };
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
        { $group: { _id: { $ifNull: ['$category', '$scamType'] }, reports: { $sum: 1 } } },
        { $sort: { reports: -1 } }, { $limit: 5 },
      ]),
      Report.find(aiCandidateMatch)
        .sort({ createdAt: -1 })
        .limit(4)
        .select('reportId reportedNumber aiFlag')
        .lean(),
      AdminAiReview.find({ agency: req.adminProfile.agency }).select('originalLabel selectedLabel').lean(),
    ]);
    const modelMetrics = getModelMetrics(aiReviews);
    return res.json({
      success: true,
      data: {
        scope: { agency: req.adminProfile.agency, jurisdiction: req.adminProfile.jurisdiction },
        kpis: {
          totalReports,
          aiModelAccuracy: modelMetrics?.accuracy ?? null,
          flaggedForReview: flagged.length,
          scamTypesTracked: categories.length,
          openReports,
          blacklisted,
          activeOfficers: officers,
        },
        modelMetrics,
        trend: trendRows.map((row) => ({ day: row._id, sms: row.reports, calls: 0 })),
        heatmap: regions.map((row) => ({ region: row._id || 'Unknown', reports: row.reports })),
        patterns: categories.map((row) => ({ category: row._id || 'UNKNOWN', reports: row.reports })),
        flagged: flagged.map((report) => ({
          id: report.reportId,
          number: report.reportedNumber,
          label: report.aiFlag?.label || 'unavailable',
          confidence: report.aiFlag?.confidenceScore ?? report.aiFlag?.probabilityScore ?? null,
        })),
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
    const scopedMatch = Object.keys(scope).length ? { $and: [scope, { 'aiFlag.available': true }] } : { 'aiFlag.available': true };
    // The AI Insights table must show all actual AI-scored reports. Limiting
    // it to grey-area labels hid malicious and legitimate classifications and
    // made the Admin screen appear empty despite stored AI data.
    const candidatesMatch = scopedMatch;
    const since30d = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    const trendMatch = Object.keys(scope).length
      ? { $and: [scope, { createdAt: { $gte: since30d } }, { 'aiFlag.available': true }] }
      : { createdAt: { $gte: since30d }, 'aiFlag.available': true };
    const [analyzed, candidates, reviews, trendRows] = await Promise.all([
      Report.countDocuments(scopedMatch),
      Report.find(candidatesMatch).sort({ createdAt: -1 }).limit(100).select('reportId reportedNumber aiFlag location jurisdiction createdAt').lean(),
      AdminAiReview.find({ agency: req.adminProfile.agency }).select('reportId originalLabel selectedLabel reviewedAt').lean(),
      Report.aggregate([
        { $match: trendMatch },
        { $group: { _id: { $dateToString: { format: '%b %d', date: '$createdAt', timezone: 'Asia/Manila' } }, analyzed: { $sum: 1 }, uncertain: { $sum: { $cond: [{ $in: ['$aiFlag.label', ['uncertain', 'grey_area']] }, 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const reviewByReport = new Map(reviews.map((review) => [review.reportId, review]));
    const modelMetrics = getModelMetrics(reviews);
    const items = candidates.map((report) => ({
      id: report.reportId,
      number: report.reportedNumber,
      label: report.aiFlag?.label || 'unavailable',
      confidence: report.aiFlag?.confidenceScore ?? report.aiFlag?.probabilityScore ?? null,
      region: report.location?.region || report.jurisdiction || 'Unknown',
      reviewed: reviewByReport.get(report.reportId) || null,
    }));
    return res.json({
      success: true,
      data: {
        analyzed,
        pendingReview: items.filter((item) => !item.reviewed).length,
        reviewed: reviews.length,
        modelMetrics,
        metricTrend: getMetricTrend(reviews),
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
  try {
    const selectedLabel = String(req.body?.selectedLabel || '').trim();
    if (!AI_REVIEW_LABELS.includes(selectedLabel)) {
      return res.status(400).json({ success: false, error: 'INVALID_LABEL', message: 'Select a valid classification label.' });
    }
    const scope = reportScope(req.adminProfile);
    const query = Object.keys(scope).length ? { $and: [scope, { reportId: req.params.reportId }] } : { reportId: req.params.reportId };
    const report = await Report.findOne(query).select('reportId aiFlag location jurisdiction').lean();
    if (!report) return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND', message: 'Report not found in your scope.' });

    const existing = await AdminAiReview.findOne({ reportId: report.reportId }).lean();
    if (existing) return res.status(409).json({ success: false, error: 'ALREADY_REVIEWED', message: 'This report already has an immutable AI review.' });
    const review = await AdminAiReview.create({
      reportId: report.reportId,
      agency: req.adminProfile.agency,
      jurisdiction: report.location?.region || report.jurisdiction || null,
      originalLabel: report.aiFlag?.label || 'unavailable',
      selectedLabel,
      reviewedBy: req.user.uid,
    });
    await auditAdminAction(req, 'AI_CLASSIFICATION_REVIEWED', { reportId: report.reportId, selectedLabel });
    return res.status(201).json({ success: true, review });
  } catch (err) {
    console.error('[admin.ai-review]', err);
    return res.status(500).json({ success: false, error: 'AI_REVIEW_FAILED', message: 'Could not save the AI review.' });
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
    if (scamType && scamType !== 'all') filters.$or = [{ category: scamType }, { scamType }];
    const query = Object.keys(scope).length ? { $and: [scope, filters] } : filters;
    const rows = await Report.aggregate([
      { $match: query },
      { $group: {
        _id: { $ifNull: ['$location.region', '$jurisdiction'] },
        reports: { $sum: 1 },
        topScamType: { $last: '$category' },
        latestReportAt: { $max: '$createdAt' },
      } },
      { $sort: { reports: -1 } }, { $limit: 100 },
    ]);
    return res.json({ success: true, data: rows.map((row) => ({ region: row._id || 'Unknown', reports: row.reports, topScamType: row.topScamType || 'UNKNOWN', latestReportAt: row.latestReportAt })) });
  } catch (err) {
    console.error('[admin.reports]', err);
    return res.status(500).json({ success: false, error: 'REPORTS_FAILED', message: 'Could not generate the regional report.' });
  }
});

module.exports = router;
