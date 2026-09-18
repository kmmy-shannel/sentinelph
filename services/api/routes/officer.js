// services/api/routes/officer.js
const express = require('express');
const router = express.Router();

const Report = require('../models/Report');
const { verifyFirebaseToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

router.use(verifyFirebaseToken);
router.use(requireRole('officer'));

const RESOLVED = ['blacklisted', 'approved', 'rejected'];

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

router.get('/dashboard', async (req, res) => {
  const uid = req.user.uid;
  // NOTE: jurisdiction filter intentionally NOT applied — matches
  // the Review Queue's behaviour. Re-enable when reports have
  // real jurisdiction values assigned.

  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // ── KPIs ────────────────────────────────────────────────
    const [pendingVote, consensusNeeded, resolvedThisWeek] = await Promise.all([
      // pending + one_approval = "waiting for your vote"
      Report.countDocuments({ status: { $in: ['pending', 'one_approval'] } }),
      Report.countDocuments({ status: 'one_approval' }),
      Report.countDocuments({
        status: { $in: RESOLVED },
        createdAt: { $gte: since7d },
      }),
    ]);

    // ── 7-day trend ─────────────────────────────────────────
    const trendAgg = await Report.aggregate([
      { $match: { createdAt: { $gte: since7d } } },
      {
        $group: {
          _id: { $dateToString: { format: '%b %d', date: '$createdAt' } },
          v: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const found = trendAgg.find((t) => t._id === label);
      trend.push({ day: label, v: found?.v ?? 0 });
    }

    // ── Heatmap (by jurisdiction) ───────────────────────────
    const heatmapAgg = await Report.aggregate([
      { $group: { _id: '$jurisdiction', v: { $sum: 1 } } },
      { $sort: { v: -1 } },
      { $limit: 6 },
    ]);

    const heatmap = heatmapAgg.map((h) => ({
      region: h._id || 'Unknown',
      v: h.v,
    }));

    // ── Consensus queue ─────────────────────────────────────
    const consensusDocs = await Report.find({ status: 'one_approval' })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    const consensusItems = consensusDocs.map((r) => ({
      id: r.reportId,
      number: r.reportedNumber || r.scammerNumber || r.sender || '—',
      type: r.scamType || r.category || 'UNKNOWN',
      votes: `${r.consensusState?.approvals ?? 0}/2`,
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