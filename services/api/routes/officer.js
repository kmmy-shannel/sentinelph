// services/api/routes/officer.js
const express = require('express');
const router = express.Router();

const Report = require('../models/Report');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(verifyFirebaseToken);
router.use(requireRole('officer'));

const RESOLVED = ['blacklisted', 'approved', 'rejected'];
const OPEN_FOR_ME = ['pending', 'under_review', 'one_approval', 'two_approvals'];
// FIX (Bug 2): include pending + under_review so "Open Cases" matches the
// Review Queue's Pending tab. Previously only one_approval/two_approvals
// were shown, which meant any report that no officer had voted on yet
// was invisible on the dashboard.
const AWAITING_FINAL = ['pending', 'under_review', 'one_approval', 'two_approvals'];
const CONSENSUS_REQUIRED = Report.CONSENSUS_REQUIRED || 3;

function timeAgo(date) {
  if (!date) return '—';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ymd(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function prettyDay(date) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

router.get('/dashboard', async (req, res) => {
  const uid = req.user.uid;

  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ── KPIs ────────────────────────────────────────────────
    const [pendingVote, consensusNeeded, resolvedThisWeek] = await Promise.all([
      Report.countDocuments({
        status: { $in: OPEN_FOR_ME },
        'votes.userId': { $ne: uid },
      }),
      Report.countDocuments({ status: { $in: AWAITING_FINAL } }),
      Report.countDocuments({
        status: { $in: RESOLVED },
        $or: [
          { resolvedAt: { $gte: since7d } },
          { resolvedAt: null, createdAt: { $gte: since7d } },
        ],
      }),
    ]);

    // ── 7-day trend ─────────────────────────────────────────
    const trendAgg = await Report.aggregate([
      { $match: { createdAt: { $gte: since7d } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
              timezone: 'Asia/Manila',
            },
          },
          v: { $sum: 1 },
        },
      },
    ]);

    const trendLookup = new Map(trendAgg.map((t) => [t._id, t.v]));
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = ymd(d);
      trend.push({
        day: prettyDay(d),
        v: trendLookup.get(key) ?? 0,
      });
    }

    // ── Heatmap (by region, split by AI Tier) ───────────────
    const heatmapAgg = await Report.aggregate([
      {
        $group: {
          _id: {
            region: {
              $ifNull: [
                '$location.region',
                { $ifNull: ['$jurisdiction', 'Unknown'] },
              ],
            },
            label: '$aiFlag.label',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.region',
          total: { $sum: '$count' },
          tiers: {
            $push: {
              label: '$_id.label',
              count: '$count',
            },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 6 },
    ]);

    const heatmap = heatmapAgg.map((h) => {
      const row = { region: h._id || 'Unknown', total: h.total };
      row.malicious = 0;
      row.grey_area = 0;
      row.legitimate = 0;
      row.uncertain = 0;

      for (const t of h.tiers) {
        if (t.label === 'malicious' || t.label === 'likely_scam') row.malicious += t.count;
        else if (t.label === 'grey_area' || t.label === 'uncertain' || t.label === 'likely_legitimate') row.grey_area += t.count;
        else if (t.label === 'legitimate') row.legitimate += t.count;
        else row.uncertain += t.count;
      }
      return row;
    });

    // ── Consensus queue ─────────────────────────────────────
    const consensusDocs = await Report.find({
      status: { $in: AWAITING_FINAL },
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    const consensusItems = consensusDocs.map((r) => {
      let tier = 'unavailable';
      const rawLabel = r.aiFlag?.label;
      if (rawLabel === 'malicious') tier = 'malicious';
      else if (rawLabel === 'grey_area') tier = 'grey_area';
      else if (rawLabel === 'legitimate') tier = 'legitimate';
      else if (rawLabel === 'uncertain' || rawLabel === 'likely_scam' || rawLabel === 'likely_legitimate') tier = 'grey_area';

      return {
        id: r.reportId,
        number: r.reportedNumber || r.scammerNumber || r.sender || '—',
        type: tier,
        votes: `${r.consensusState?.approvals ?? 0}/${CONSENSUS_REQUIRED}`,
        approvals: r.consensusState?.approvals ?? 0,
        rejections: r.consensusState?.rejections ?? 0,
        since: timeAgo(r.createdAt),
        createdAt: r.createdAt,
      };
    });

    // ── Recent decisions by this officer ────────────────────
    const decisionDocs = await Report.find({ 'votes.userId': uid })
      .sort({ 'votes.votedAt': -1 })
      .limit(10)
      .lean();

    const decisions = decisionDocs
      .map((r) => {
        const myVotes = (r.votes || [])
          .filter((v) => v.userId === uid)
          .sort((a, b) => new Date(b.votedAt) - new Date(a.votedAt));
        const myVote = myVotes[0];
        if (!myVote) return null;

        let tier = 'unavailable';
        const rawLabel = r.aiFlag?.label;
        if (rawLabel === 'malicious') tier = 'malicious';
        else if (rawLabel === 'grey_area') tier = 'grey_area';
        else if (rawLabel === 'legitimate') tier = 'legitimate';
        else if (rawLabel === 'uncertain' || rawLabel === 'likely_scam' || rawLabel === 'likely_legitimate') tier = 'grey_area';

        return {
          id: r.reportId,
          number: r.reportedNumber || r.scammerNumber || r.sender || '—',
          type: tier,
          decision: myVote.decision === 'approve' ? 'Approved' : 'Rejected',
          ts: myVote.votedAt
            ? new Date(myVote.votedAt).toLocaleString('en-PH', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—',
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    return res.json({
      success: true,
      data: {
        kpis: { pendingVote, consensusNeeded, resolvedThisWeek },
        trend,
        heatmap,
        consensusItems,
        decisions,
      },
    });
  } catch (err) {
    console.error('[officer/dashboard]', err);
    return res.status(500).json({
      success: false,
      error: 'DASHBOARD_FAILED',
      message: 'Failed to load officer dashboard.',
    });
  }
});

module.exports = router;