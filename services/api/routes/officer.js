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
const AWAITING_FINAL = ['one_approval', 'two_approvals'];
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
      // "Pending your vote" = OPEN reports this officer hasn't voted on.
      Report.countDocuments({
        status: { $in: OPEN_FOR_ME },
        'votes.userId': { $ne: uid },
      }),
      // "Consensus needed" = anything waiting on a final 3rd vote.
      Report.countDocuments({ status: { $in: AWAITING_FINAL } }),
      // "Resolved this week" = resolved in last 7 days (uses resolvedAt when set).
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

    // ── Heatmap (by region) ─────────────────────────────────
    const heatmapAgg = await Report.aggregate([
      {
        $group: {
          _id: {
            $ifNull: [
              '$location.region',
              { $ifNull: ['$jurisdiction', 'Unknown'] },
            ],
          },
          v: { $sum: 1 },
        },
      },
      { $sort: { v: -1 } },
      { $limit: 6 },
    ]);

    const heatmap = heatmapAgg.map((h) => ({
      region: h._id || 'Unknown',
      v: h.v,
    }));

    // ── Consensus queue ─────────────────────────────────────
    // All cases still awaiting the final 3rd vote (1 or 2 approvals so far),
    // regardless of whether this officer has voted. The table is monitoring,
    // not task assignment — "Pending Your Vote" KPI handles that.
    const consensusDocs = await Report.find({
      status: { $in: AWAITING_FINAL },
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    const consensusItems = consensusDocs.map((r) => ({
      id: r.reportId,
      number: r.reportedNumber || r.scammerNumber || r.sender || '—',
      type: r.scamType || r.category || 'UNKNOWN',
      votes: `${r.consensusState?.approvals ?? 0}/${CONSENSUS_REQUIRED}`,
      since: timeAgo(r.createdAt),
      createdAt: r.createdAt,
    }));

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
        return {
          id: r.reportId,
          number: r.reportedNumber || r.scammerNumber || r.sender || '—',
          type: r.scamType || r.category || 'UNKNOWN',
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