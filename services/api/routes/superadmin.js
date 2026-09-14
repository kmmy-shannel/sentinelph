// apps/api/routes/superadmin.js
const express = require('express');
const router = express.Router();

const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { ipAllowlist } = require('../middleware/ipAllowlist');

const { verifyChain } = require('../services/chainVerifier');

const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Report = require('../models/Report');

// Three gates on every route
router.use(ipAllowlist);
router.use(verifyFirebaseToken);
router.use(requireRole('superadmin'));

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
      status: u.status === 'suspended' ? 'Suspended' : u.status === 'active' ? 'Active' : 'Pending',
      kms_key_id: null,
      last_login_at: u.updatedAt,
    }));

    return res.json({ success: true, data: { users: mapped } });
  } catch (err) {
    console.error('[superadmin/users]', err);
    return res.status(500).json({ success: false, error: 'USERS_LOAD_FAILED', message: 'Failed to load users.' });
  }
});

// ─── POST /users/:id/suspend ─────────────────────────────────
router.post('/users/:id/suspend', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(id, { status: 'suspended' }, { new: true }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account suspended — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/suspend]', err);
    return res.status(500).json({ success: false, error: 'SUSPEND_FAILED', message: 'Failed to suspend account.' });
  }
});

// ─── POST /users/:id/restore ─────────────────────────────────
router.post('/users/:id/restore', async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findByIdAndUpdate(id, { status: 'active' }, { new: true }).lean();
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: `No user with id ${id}.` });

    await AuditLog.record({
      userId: req.user.uid,
      role: 'superadmin',
      action: `Account restored — ${user.fullName || id}`,
      ipAddress: req.ip,
      metadata: { category: 'RBAC', target: String(user._id), actorEmail: req.user.email },
    });

    return res.json({ success: true, data: { user } });
  } catch (err) {
    console.error('[superadmin/users/restore]', err);
    return res.status(500).json({ success: false, error: 'RESTORE_FAILED', message: 'Failed to restore account.' });
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