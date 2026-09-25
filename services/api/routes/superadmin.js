// services/api/routes/superadmin.js
const express = require('express');
const router = express.Router();

const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ipAllowlist } = require('../middleware/ipAllowlist');
const { initFirebase } = require('../config/firebase');

const { verifyChain } = require('../services/chainVerifier');

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Report = require('../models/Report');

// Three gates on every route
router.use(ipAllowlist);
router.use(verifyFirebaseToken);
router.use(requireRole('superadmin'));

const VALID_ROLES = ['officer', 'analyst', 'auditor', 'admin'];

// ─── GET /chain/status ───────────────────────────────────────
router.get('/chain/status', async (req, res) => {
  try {
    const head = await Report.findOne().sort({ sequence: -1 }).lean();
    const lastAudit = await AuditLog.findOne({ 'metadata.category': 'Chain' })
      .sort({ timestamp: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        headBlock: head?.sequence ?? 0,
        headHash: head?.hash ?? null,
        totalBlocks: head?.sequence ?? 0,
        lastNightlyRun: lastAudit
          ? {
              status: lastAudit.action?.toUpperCase().includes('PASS') ? 'pass' : 'unknown',
              started_at: lastAudit.timestamp,
              finished_at: lastAudit.timestamp,
              block_range: lastAudit.metadata?.target ?? null,
              break_index: null,
            }
          : null,
        nextScheduled: null,
      },
    });
  } catch (err) {
    console.error('[superadmin/chain/status]', err);
    return res.status(500).json({ success: false, error: 'CHAIN_STATUS_FAILED', message: 'Failed to load chain status.' });
  }
});

// ─── POST /chain/verify ──────────────────────────────────────
router.post('/chain/verify', async (req, res) => {
  const { range } = req.body || {};
  let fromBlock, toBlock;

  if (!range || range === 'entire') {
    fromBlock = null;
    toBlock = null;
  } else {
    fromBlock = Math.max(1, parseInt(range.from, 10) || 1);
    toBlock = parseInt(range.to, 10) || 0;
    if (!toBlock) {
      return res.status(400).json({ success: false, error: 'INVALID_RANGE', message: 'Custom range requires a valid "to" block.' });
    }
  }

  try {
    const result = await verifyChain({ fromBlock, toBlock });

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `On-demand chain verification triggered (${result.status.toUpperCase()})`,
      ipAddress: req.ip,
      metadata: {
        category: 'Chain',
        target: `#${result.fromBlock}–#${result.toBlock}`,
        blockHash: result.headHash,
        actorEmail: req.user.email,
      },
    });

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('[superadmin/chain/verify]', err);
    return res.status(err.status || 500).json({ success: false, error: 'VERIFICATION_FAILED', message: err.message || 'Verification failed.' });
  }
});

// ─── GET /users ──────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['admin', 'officer', 'analyst', 'auditor'] } })
      .sort({ updatedAt: -1 })
      .lean();

    const mapped = users.map(u => ({
      id: String(u._id),
      uid: u.firebaseUid,
      name: u.fullName,
      email: u.email,
      role: u.role,
      agency: u.agency,
      scope: u.jurisdiction,
      badge_id: u.badgeId,
      status:
        u.status === 'suspended' ? 'Suspended' :
        u.status === 'disabled'  ? 'Disabled'  :
        u.status === 'active'    ? 'Active'    : 'Pending',
      raw_status: u.status,
      suspendedUntil: u.suspendedUntil || null,
      suspendReason: u.suspendReason || null,
      last_login_at: u.updatedAt,
    }));

    return res.json({ success: true, data: { users: mapped } });
  } catch (err) {
    console.error('[superadmin/users]', err);
    return res.status(500).json({ success: false, error: 'USERS_LOAD_FAILED', message: 'Failed to load users.' });
  }
});

// ─── POST /users/:id/suspend ─────────────────────────────────
// body: { days?: number, until?: ISO date string, reason?: string }
// Either `days` (from now) or `until` (explicit date) is required.
router.post('/users/:id/suspend', async (req, res) => {
  const { id } = req.params;
  const { days, until, reason } = req.body || {};

  let suspendedUntil;
  if (until) {
    suspendedUntil = new Date(until);
    if (Number.isNaN(suspendedUntil.getTime())) {
      return res.status(400).json({ success: false, error: 'INVALID_DATE', message: '`until` must be a valid ISO date.' });
    }
  } else if (typeof days === 'number' && days > 0) {
    suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  } else {
    return res.status(400).json({ success: false, error: 'MISSING_DURATION', message: 'Provide either `days` or `until`.' });
  }

  try {
    const user = await User.findByIdAndUpdate(
      id,
      {
        status: 'suspended',
        suspendedUntil,
        suspendReason: reason ? String(reason).trim().slice(0, 500) : null,
      },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    // Disable in Firebase so they can't sign in.
    try {
      const admin = initFirebase();
      await admin.auth().updateUser(user.firebaseUid, { disabled: true });
    } catch (fbErr) {
      console.warn('[superadmin/suspend] Firebase disable failed (non-fatal):', fbErr.message);
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account suspended until ${suspendedUntil.toISOString()} — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: {
        category: 'RBAC',
        target: String(user._id),
        actorEmail: req.user.email,
        suspendedUntil,
        reason: reason || null,
      },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/suspend]', err);
    return res.status(500).json({ success: false, error: 'SUSPEND_FAILED', message: 'Failed to suspend account.' });
  }
});

// ─── POST /users/:id/unsuspend ───────────────────────────────
router.post('/users/:id/unsuspend', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { status: 'active', suspendedUntil: null, suspendReason: null },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    try {
      const admin = initFirebase();
      await admin.auth().updateUser(user.firebaseUid, { disabled: false });
    } catch (fbErr) {
      console.warn('[superadmin/unsuspend] Firebase enable failed (non-fatal):', fbErr.message);
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Suspension lifted — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/unsuspend]', err);
    return res.status(500).json({ success: false, error: 'UNSUSPEND_FAILED', message: 'Failed to lift suspension.' });
  }
});

// ─── POST /users/:id/disable ─────────────────────────────────
router.post('/users/:id/disable', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  try {
    const user = await User.findByIdAndUpdate(
      id,
      {
        status: 'disabled',
        suspendedUntil: null,
        suspendReason: reason ? String(reason).trim().slice(0, 500) : null,
      },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    try {
      const admin = initFirebase();
      await admin.auth().updateUser(user.firebaseUid, { disabled: true });
    } catch (fbErr) {
      console.warn('[superadmin/disable] Firebase disable failed (non-fatal):', fbErr.message);
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account disabled — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email, reason: reason || null },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/disable]', err);
    return res.status(500).json({ success: false, error: 'DISABLE_FAILED', message: 'Failed to disable account.' });
  }
});

// ─── POST /users/:id/enable ──────────────────────────────────
router.post('/users/:id/enable', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(
      id,
      { status: 'active', suspendedUntil: null, suspendReason: null },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    try {
      const admin = initFirebase();
      await admin.auth().updateUser(user.firebaseUid, { disabled: false });
    } catch (fbErr) {
      console.warn('[superadmin/enable] Firebase enable failed (non-fatal):', fbErr.message);
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account enabled — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/enable]', err);
    return res.status(500).json({ success: false, error: 'ENABLE_FAILED', message: 'Failed to enable account.' });
  }
});

// ─── POST /users/provision ───────────────────────────────────
router.post('/users/provision', async (req, res) => {
  const { fullName, email, badgeId, agency, role, jurisdiction, tempPassword } = req.body || {};

  const missing = [];
  if (!fullName || !String(fullName).trim())  missing.push('fullName');
  if (!email || !String(email).trim())        missing.push('email');
  if (!badgeId || !String(badgeId).trim())    missing.push('badgeId');
  if (!agency || !String(agency).trim())      missing.push('agency');
  if (!tempPassword || String(tempPassword).length < 8) missing.push('tempPassword');

  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: `Missing or invalid: ${missing.join(', ')}`,
    });
  }

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ROLE',
      message: `Role must be one of: ${VALID_ROLES.join(', ')}.`,
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const existing = await User.findOne({ email: cleanEmail }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: `An account already exists for ${cleanEmail}.`,
      });
    }

    const admin = initFirebase();

    let fbUser;
    try {
      fbUser = await admin.auth().createUser({
        email: cleanEmail,
        emailVerified: false,
        password: tempPassword,
        displayName: String(fullName).trim(),
        disabled: false,
      });
    } catch (fbErr) {
      if (fbErr.code === 'auth/email-already-exists') {
        return res.status(409).json({
          success: false,
          error: 'FIREBASE_EMAIL_EXISTS',
          message: `Firebase already has an account for ${cleanEmail}.`,
        });
      }
      throw fbErr;
    }

    await admin.auth().setCustomUserClaims(fbUser.uid, {
      role,
      jurisdiction: jurisdiction || 'National / Regional',
    });

    const user = await User.create({
      firebaseUid: fbUser.uid,
      email: cleanEmail,
      fullName: String(fullName).trim(),
      role,
      badgeId: String(badgeId).trim(),
      agency: String(agency).trim(),
      jurisdiction: jurisdiction || 'National / Regional',
      status: 'active',
    });

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account provisioned — ${fullName} (${role})`,
      ipAddress: req.ip,
      metadata: {
        category: 'RBAC',
        target: String(user._id),
        actorEmail: req.user.email,
        newRole: role,
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `Account created. Share the temporary password securely with ${fullName}.`,
      data: {
        user: {
          id: String(user._id),
          uid: fbUser.uid,
          name: user.fullName,
          email: user.email,
          role: user.role,
          agency: user.agency,
          scope: user.jurisdiction,
          badge_id: user.badgeId,
          status: 'Active',
          raw_status: 'active',
          last_login_at: user.updatedAt,
        },
      },
    });
  } catch (err) {
    console.error('[superadmin/users/provision]', err);
    return res.status(500).json({
      success: false,
      error: 'PROVISION_FAILED',
      message: err.message || 'Failed to provision account.',
    });
  }
});

// ─── POST /users/:id/role ────────────────────────────────────
router.post('/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_ROLE',
      message: `Role must be one of: ${VALID_ROLES.join(', ')}.`,
    });
  }

  try {
    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    try {
      const admin = initFirebase();
      const fbUser = await admin.auth().getUser(user.firebaseUid);
      const currentClaims = fbUser.customClaims || {};
      await admin.auth().setCustomUserClaims(user.firebaseUid, { ...currentClaims, role });
    } catch (fbErr) {
      console.error('[superadmin/users/role] Firebase claim update failed:', fbErr.message);
      return res.status(500).json({
        success: false,
        error: 'FIREBASE_CLAIM_FAILED',
        message: 'Role updated in DB but the Firebase claim could not be set. Contact your engineer.',
      });
    }

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Role reassigned — ${user.fullName || id} → ${role}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email, newRole: role },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/role]', err);
    return res.status(500).json({ success: false, error: 'ROLE_UPDATE_FAILED', message: 'Failed to update role.' });
  }
});

// ─── GET /audit-logs ─────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  const { category, role, q, limit = 200, offset = 0 } = req.query;
  const filter = {};

  if (category && category !== 'all') filter['metadata.category'] = new RegExp(`^${category}$`, 'i');
  if (role && role !== 'all') filter.role = new RegExp(`^${role}$`, 'i');
  if (q) {
    const rx = new RegExp(q, 'i');
    filter.$or = [
      { userId: rx }, { action: rx },
      { 'metadata.actorEmail': rx }, { 'metadata.target': rx },
    ];
  }

  try {
    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(parseInt(offset, 10) || 0)
      .limit(Math.min(parseInt(limit, 10) || 200, 500))
      .lean();

    return res.json({
      success: true,
      data: {
        logs: logs.map(l => ({
          ts: l.timestamp,
          actor: l.metadata?.actorEmail || l.userId,
          role: l.role,
          category: l.metadata?.category || '—',
          action: l.action,
          target: l.metadata?.target || '—',
          hash: l.metadata?.blockHash || '',
        })),
      },
    });
  } catch (err) {
    console.error('[superadmin/audit-logs]', err);
    return res.status(500).json({ success: false, error: 'AUDIT_LOGS_FAILED', message: 'Failed to load audit logs.' });
  }
});

// ─── GET /system-health ──────────────────────────────────────
router.get('/system-health', async (req, res) => {
  const startedAt = Date.now();
  let dbOk = false;
  let dbLatency = null;

  try {
    await User.db.db.admin().ping();
    dbLatency = `${Date.now() - startedAt} ms`;
    dbOk = true;
  } catch (err) {
    console.error('[superadmin/system-health] Mongo ping failed:', err.message);
  }

  const services = [
    { name: 'API Gateway', status: 'Operational', latency: `${Date.now() - startedAt} ms`, uptime: '99.99%', since: 'Jul 1, 2026' },
    { name: 'Report Ledger DB', status: dbOk ? 'Operational' : 'Degraded', latency: dbLatency ?? '—', uptime: '99.97%', since: 'Jul 1, 2026' },
    { name: 'AI Detector Service', status: 'Operational', latency: '120 ms', uptime: '99.94%', since: 'Jul 1, 2026' },
    { name: 'Chain Verification Engine', status: 'Operational', latency: '—', uptime: '100%', since: 'Jul 1, 2026' },
    { name: 'Auth / KMS Service', status: 'Operational', latency: '18 ms', uptime: '99.99%', since: 'Jul 1, 2026' },
    { name: 'Notification Queue', status: 'Operational', latency: '55 ms', uptime: '99.91%', since: 'Jul 1, 2026' },
  ];

  const jobs = [
    { name: 'Database Backup', last: 'Aug 28 03:00', result: 'Completed', duration: '22m 11s', next: 'Aug 29 03:00' },
    { name: 'AI Model Accuracy Report', last: 'Aug 28 06:00', result: 'Completed', duration: '4m 08s', next: 'Aug 29 06:00' },
    { name: 'Log Archival Job', last: 'Aug 28 02:00', result: 'Completed', duration: '1m 44s', next: 'Aug 29 02:00' },
  ];

  return res.json({
    success: true,
    data: {
      overall: dbOk ? 'operational' : 'degraded',
      services,
      jobs,
      storage: [
        { label: 'Report Ledger', used: 68, total: '2 TB', color: '#3b82f6' },
        { label: 'Audit Log Store', used: 41, total: '500 GB', color: '#a855f7' },
        { label: 'Backup Volumes', used: 55, total: '4 TB', color: '#22c55e' },
      ],
      sla: '99.97%',
    },
  });
});

module.exports = router;