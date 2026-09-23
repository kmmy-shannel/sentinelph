// services/api/routes/notifications.js
const express = require('express');
const router = express.Router();

const Report = require('../models/Report');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { verifyFirebaseToken } = require('../middleware/auth');

router.use(verifyFirebaseToken);

const UNCLASSIFIED = 'UNCLASSIFIED';

function dayTime(date) {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function buildNotifications(user) {
  const uid = user.uid;
  const role = user.role;
  const jurisdiction = user.jurisdiction;
  const notifications = [];

  if (role === 'officer') {
    const scope = jurisdiction
      ? {
          $or: [
            { 'location.region': jurisdiction },
            { 'location.region': UNCLASSIFIED },
            { 'location.region': null },
            { 'location.region': { $exists: false } },
          ],
        }
      : {};

    const oneApproval = await Report.find({
      ...scope,
      status: 'one_approval',
      'votes.userId': { $ne: uid },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(5)
      .lean();

    oneApproval.forEach((r) => {
      notifications.push({
        id: `oa-${r.reportId}`,
        type: 'urgent',
        title: `Additional vote needed — ${r.reportId.slice(0, 12)}`,
        body: `${r.reportedNumber || r.sender || 'Unknown'} (${r.scamType || 'UNKNOWN'}) has 1 of 3 required votes. Your vote moves it closer to finalization.`,
        time: dayTime(r.updatedAt || r.createdAt),
      });
    });

    const twoApprovals = await Report.find({
      ...scope,
      status: 'two_approvals',
      'votes.userId': { $ne: uid },
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(5)
      .lean();

    twoApprovals.forEach((r) => {
      notifications.push({
        id: `ta-${r.reportId}`,
        type: 'urgent',
        title: `Final vote needed — ${r.reportId.slice(0, 12)}`,
        body: `${r.reportedNumber || r.sender || 'Unknown'} (${r.scamType || 'UNKNOWN'}) has 2 of 3 votes. As 3rd officer, your vote finalizes the decision.`,
        time: dayTime(r.updatedAt || r.createdAt),
      });
    });

    const justBlacklisted = await Report.find({
      ...scope,
      status: 'blacklisted',
      resolvedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
      .sort({ resolvedAt: -1 })
      .limit(3)
      .lean();

    justBlacklisted.forEach((r) => {
      notifications.push({
        id: `bl-${r.reportId}`,
        type: 'info',
        title: `Number blacklisted — ${r.reportedNumber || r.sender || 'Unknown'}`,
        body: `${r.scamType || 'UNKNOWN'} report ${r.reportId.slice(0, 12)} reached 3-officer consensus and was added to the Blacklist Registry.`,
        time: dayTime(r.resolvedAt),
      });
    });
  }

  if (role === 'admin' || role === 'superadmin') {
    const lastCheck = await AuditLog.findOne({
      action: { $in: ['CHAIN_VERIFICATION_RUN', 'CHAIN_INTEGRITY_CHECK'] },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (lastCheck) {
      notifications.push({
        id: `chain-${lastCheck._id}`,
        type: 'system',
        title: 'Nightly integrity check passed',
        body: `Blockchain hash-chain verification completed. ${lastCheck.metadata?.rangeChecked || '—'} blocks verified.`,
        time: dayTime(lastCheck.timestamp),
      });
    }
  }

  return notifications;
}

/**
 * GET /api/v1/notifications
 * Returns notifications with per-user unread state derived from
 * readNotificationIds on the User document.
 */
router.get('/', async (req, res) => {
  try {
    const me = await User.findOne({ firebaseUid: req.user.uid })
      .select('readNotificationIds')
      .lean();
    const readIds = new Set(me?.readNotificationIds ?? []);

    const raw = await buildNotifications(req.user);
    const data = raw.map((n) => ({ ...n, unread: !readIds.has(n.id) }));
    const unreadCount = data.filter((n) => n.unread).length;

    return res.json({ success: true, data, unreadCount });
  } catch (err) {
    console.error('[notifications]', err);
    return res.status(500).json({ success: false, error: 'NOTIFICATIONS_FAILED' });
  }
});

/**
 * POST /api/v1/notifications/:id/seen
 * Marks ONE notification as read.
 */
router.post('/:id/seen', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, error: 'MISSING_ID' });

    await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { $addToSet: { readNotificationIds: id } }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('[notifications/:id/seen]', err);
    return res.status(500).json({ success: false, error: 'SEEN_UPDATE_FAILED' });
  }
});

/**
 * POST /api/v1/notifications/seen-all
 * Marks every CURRENT notification as read by adding all their IDs.
 */
router.post('/seen-all', async (req, res) => {
  try {
    const raw = await buildNotifications(req.user);
    const ids = raw.map((n) => n.id);

    if (ids.length > 0) {
      await User.findOneAndUpdate(
        { firebaseUid: req.user.uid },
        { $addToSet: { readNotificationIds: { $each: ids } } }
      );
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[notifications/seen-all]', err);
    return res.status(500).json({ success: false, error: 'SEEN_UPDATE_FAILED' });
  }
});

module.exports = router;