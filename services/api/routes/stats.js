// services/api/routes/stats.js
const express = require('express');
const router = express.Router();

const Report = require('../models/Report');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const { verifyFirebaseToken } = require('../middleware/auth');

// Disable HTTP caching — badge counts change constantly.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const UNRESOLVED = ['pending', 'under_review', 'one_approval'];
const RESOLVED = ['blacklisted', 'approved', 'rejected'];

// ─────────────────────────────────────────────────────────────
// GET /api/v1/stats/public
// ─────────────────────────────────────────────────────────────
router.get('/public', async (req, res) => {
  try {
    const [reportsFiled, casesClosed] = await Promise.all([
      Report.countDocuments(),
      Report.countDocuments({ status: { $in: RESOLVED } }),
    ]);

    res.json({
      success: true,
      data: { reportsFiled, casesClosed, version: '2.4.1' },
    });
  } catch (err) {
    console.error('[stats/public]', err);
    res.json({ success: true, data: { reportsFiled: 0, casesClosed: 0, version: '2.4.1' } });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/v1/stats/badges
// ─────────────────────────────────────────────────────────────
router.get('/badges', verifyFirebaseToken, async (req, res) => {
  const role = req.user.role;
  const jurisdiction = req.user.jurisdiction;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const badges = {};

  try {
    // ─── OFFICER ──────────────────────────────────────────
    if (role === 'officer') {
      const unresolvedQ = { status: { $in: UNRESOLVED } };
      if (jurisdiction) unresolvedQ.jurisdiction = jurisdiction;
      badges.reviewQueue = await Report.countDocuments(unresolvedQ);

      const recentQ = {
        status: { $in: ['blacklisted', 'approved'] },
        createdAt: { $gte: since24h },
      };
      if (jurisdiction) recentQ.jurisdiction = jurisdiction;
      badges.registry = await Report.countDocuments(recentQ);
    }

    // ─── ADMIN ────────────────────────────────────────────
    if (role === 'admin') {
      const officerQ = {
        role: 'officer',
        status: 'pending_activation',
      };
      if (jurisdiction) officerQ.jurisdiction = jurisdiction;
      badges.officers = await User.countDocuments(officerQ);

      const reportQ = { createdAt: { $gte: since24h } };
      if (jurisdiction) reportQ.jurisdiction = jurisdiction;
      badges.reports = await Report.countDocuments(reportQ);
    }

    // ─── SUPERADMIN ───────────────────────────────────────
    if (role === 'superadmin') {
      badges.usersRbac = await User.countDocuments({
        role: { $in: ['admin', 'officer', 'analyst', 'auditor'] },
        status: { $in: ['pending_activation', 'suspended'] },
      });

      // Count audit events since the last time this user viewed the Audit Logs tab
      const me = await User.findOne({ firebaseUid: req.user.uid })
        .select('lastSeenAuditLog')
        .lean();
      const sinceAudit = me?.lastSeenAuditLog || since24h;

      badges.auditLogs = await AuditLog.countDocuments({
        timestamp: { $gte: sinceAudit },
      });

      // Chain integrity — flag if last verification failed
      try {
        const lastChainFail = await AuditLog.findOne({
          'metadata.category': 'Chain',
          action: /FAIL/i,
        })
          .sort({ timestamp: -1 })
          .lean();

        const lastChainPass = await AuditLog.findOne({
          'metadata.category': 'Chain',
          action: /PASS/i,
        })
          .sort({ timestamp: -1 })
          .lean();

        const failIsNewer =
          lastChainFail &&
          (!lastChainPass || lastChainFail.timestamp > lastChainPass.timestamp);

        if (failIsNewer) badges.chainIntegrity = 1;
      } catch {
        // ignore
      }
    }

    console.log('[stats/badges]', role, '→', JSON.stringify(badges));
    return res.json({ success: true, data: badges });
  } catch (err) {
    console.error('[stats/badges]', err);
    return res.json({ success: true, data: {} });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/v1/stats/seen/audit-logs
// Marks "I have seen all audit logs up to now".
// ─────────────────────────────────────────────────────────────
router.post('/seen/audit-logs', verifyFirebaseToken, async (req, res) => {
  try {
    await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { lastSeenAuditLog: new Date() }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[stats/seen/audit-logs]', err);
    return res.status(500).json({ success: false, error: 'SEEN_UPDATE_FAILED' });
  }
});

module.exports = router;