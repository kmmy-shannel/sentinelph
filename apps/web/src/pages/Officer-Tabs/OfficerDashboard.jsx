// apps/web/src/pages/Officer-Tabs/OfficerDashboard.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import apiClient from "../../lib/api";

/**
 * Expected shape from GET /api/v1/officer/dashboard:
 *
 *   data: {
 *     kpis: {
 *       pendingVote:        number,  // reports this officer hasn't voted on yet
 *       splitDecisions:     number,  // 1 approve + 1 reject, 3rd vote needed
 *       resolvedThisWeek:   number,  // decisions finalized in last 7 days
 *     },
 *     trend:  [ { day: "Mon", v: number }, ... ],
 *     heatmap:[ { region: "Region I", v: number }, ... ],
 *     consensusItems: [
 *       {
 *         id: string,
 *         number: string,
 *         type: string,
 *         approvals: number,
 *         rejections: number,
 *         votes: number,
 *         since: string,
 *       }, ...
 *     ],
 *     consensusBreakdown: {           // OPTIONAL — UI derives if absent
 *       awaitingFirst:      number,
 *       awaitingSecond:     number,
 *       awaitingTiebreaker: number,
 *       totalOpen:          number,
 *     },
 *     decisions: [
 *       { id, number, type, decision: "Approved" | "Rejected", ts: string }, ...
 *     ],
 *   }
 */

// ─── Design tokens ───────────────────────────────────────────────────
const SURFACE       = "#0e0e18";
const SURFACE_MUTED = "#0a0a12";
const BORDER        = "#1a1a2a";
const BORDER_SOFT   = "#13131e";
const TEXT_PRIMARY  = "#ffffff";
const TEXT_MUTED    = "#94a3b8";
const TEXT_FAINT    = "#4b5563";
const MONO          = "'JetBrains Mono', monospace";

const BLUE          = "#3b82f6";
const RED           = "#ef4444";
const AMBER         = "#f59e0b";
const GREEN         = "#22c55e";

const card = {
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: "12px",
  padding: "20px",
};

// Table header/cell styles, unified to two font sizes.
const thS = {
  textAlign: "left",
  paddingBottom: "10px",
  fontWeight: 500,
  color: TEXT_FAINT,
  fontFamily: MONO,
  fontSize: "9px",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};
const tdS = {
  padding: "10px 0",
  fontSize: "12px",
  borderTop: `1px solid ${BORDER_SOFT}`,
  verticalAlign: "middle",
};

// ─── Small helpers ───────────────────────────────────────────────────
function formatVoteTally(approvals = 0, rejections = 0) {
  const parts = [];
  if (approvals)  parts.push(`${approvals} approve`);
  if (rejections) parts.push(`${rejections} reject`);
  return parts.length ? parts.join(" · ") : "—";
}

function deriveBreakdown(items = []) {
  let awaitingFirst = 0;
  let awaitingSecond = 0;
  let awaitingTiebreaker = 0;
  for (const it of items) {
    const v = Number(it.votes) || 0;
    const a = Number(it.approvals) || 0;
    const r = Number(it.rejections) || 0;
    if (v === 0) awaitingFirst += 1;
    else if (v === 1) awaitingSecond += 1;
    else if (v === 2 && a === 1 && r === 1) awaitingTiebreaker += 1;
  }
  return {
    awaitingFirst,
    awaitingSecond,
    awaitingTiebreaker,
    totalOpen: awaitingFirst + awaitingSecond + awaitingTiebreaker,
  };
}

// Small chip used for the two-chip vote tally in the consensus table.
function VoteChip({ kind, count }) {
  const isApproval = kind === "approve";
  const color = isApproval ? GREEN : RED;
  const bg    = isApproval ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
  const bd    = isApproval ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)";
  const glyph = isApproval ? "✓" : "✕";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 7px",
        borderRadius: "999px",
        fontSize: "10px",
        fontWeight: 700,
        fontFamily: MONO,
        color,
        background: bg,
        border: `1px solid ${bd}`,
        marginRight: "6px",
      }}
    >
      <span style={{ fontSize: "10px", lineHeight: 1 }}>{glyph}</span>
      {count}
    </span>
  );
}

// Small pill used in the consensus card subtitle.
function StatPill({ label, value, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        color: TEXT_MUTED,
        background: SURFACE_MUTED,
        border: `1px solid ${BORDER}`,
        marginRight: "8px",
        marginBottom: "6px",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      <span style={{ color: TEXT_PRIMARY, fontWeight: 600, fontFamily: MONO }}>{value}</span>
      <span>{label}</span>
    </span>
  );
}

export default function OfficerDashboard() {
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [resolvedIds, setResolvedIds]   = useState([]);
  const [dataVersion, setDataVersion]   = useState(0);

  const initialFetchDoneRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get('/api/v1/officer/dashboard');
      setData(res.data);
      setDataVersion(v => v + 1);
    } catch (err) {
      console.error('[OfficerDashboard] load failed:', err);
      setError(err?.response?.data?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialFetchDoneRef.current) return;
    initialFetchDoneRef.current = true;
    loadDashboard();
  }, [loadDashboard]);

  const kpis      = data?.kpis ?? { pendingVote: 0, splitDecisions: 0, resolvedThisWeek: 0 };
  const trend     = data?.trend ?? [];
  const heatmap   = data?.heatmap ?? [];
  const consensus = (data?.consensusItems ?? []).filter(i => !resolvedIds.includes(i.id));
  const decisions = data?.decisions ?? [];

  const breakdown  = data?.consensusBreakdown ?? deriveBreakdown(consensus);
  const heatmapMax = heatmap.reduce((m, row) => Math.max(m, Number(row.v) || 0), 0) || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: RED, fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* ─── KPI row ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        {[
          { l: "PENDING YOUR VOTE",   v: kpis.pendingVote,        sub: "Tap to review",     accent: RED   },
          { l: "SPLIT DECISIONS",     v: kpis.splitDecisions,     sub: "3rd vote needed",   accent: AMBER },
          { l: "RESOLVED THIS WEEK",  v: kpis.resolvedThisWeek,   sub: "Last 7 days",       accent: GREEN },
        ].map(s => (
          <div key={s.l} style={card}>
            <div
              style={{
                fontSize: "10px",
                marginBottom: "10px",
                color: TEXT_FAINT,
                fontFamily: MONO,
                letterSpacing: "0.08em",
              }}
            >
              {s.l}
            </div>
            <div
              style={{
                fontSize: "34px",
                fontWeight: 800,
                color: TEXT_PRIMARY,
                marginBottom: "6px",
                fontFamily: MONO,
                lineHeight: 1,
              }}
            >
              {loading ? "—" : s.v}
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: s.accent,
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: s.accent,
                  display: "inline-block",
                }}
              />
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: `1px solid ${GREEN}40`, color: GREEN, display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Vote submitted successfully.
        </div>
      )}

      {/* ─── Charts row ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={{ ...card, animation: "cardFade 0.25s ease-out" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_PRIMARY, marginBottom: "4px" }}>7-Day Report Trend</div>
          <div style={{ fontSize: "11px", color: TEXT_FAINT, marginBottom: "16px" }}>Daily incoming reports, your jurisdiction</div>
          <div style={{ pointerEvents: "none" }}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                key={`trend-${dataVersion}`}
                data={trend}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BLUE} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={BLUE}
                  strokeWidth={2}
                  fill="url(#blueGrad)"
                  isAnimationActive={true}
                  animationBegin={0}
                  animationDuration={900}
                  animationEasing="ease-out"
                  activeDot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ ...card, animation: "cardFade 0.25s ease-out" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_PRIMARY, marginBottom: "4px" }}>Regional Heatmap</div>
          <div style={{ fontSize: "11px", color: TEXT_FAINT, marginBottom: "16px" }}>Cumulative reports by jurisdiction</div>
          <div style={{ pointerEvents: "none" }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                key={`heatmap-${dataVersion}`}
                data={heatmap}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <XAxis type="number" tick={{ fill: TEXT_FAINT, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="region" type="category" tick={{ fill: TEXT_MUTED, fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <Bar
                  dataKey="v"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={true}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {heatmap.map((row, i) => {
                    const v = Number(row.v) || 0;
                    const opacity = 0.35 + 0.6 * (v / heatmapMax);
                    return (
                      <Cell
                        key={i}
                        fill={`rgba(59,130,246,${Math.min(0.95, opacity)})`}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── Tables row ─────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Open cases card */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_PRIMARY, marginBottom: "4px" }}>
            Open Cases
          </div>
          <div style={{ fontSize: "11px", color: TEXT_FAINT, marginBottom: "14px" }}>
            Reports still collecting votes
          </div>

          {/* Pill row — replaces the old wall-of-text subtitle */}
          {!loading && (
            <div style={{ marginBottom: "14px" }}>
              <StatPill label="awaiting 1st"  value={breakdown.awaitingFirst}      color={TEXT_MUTED} />
              <StatPill label="awaiting 2nd"  value={breakdown.awaitingSecond}     color={AMBER} />
              <StatPill label="split"         value={breakdown.awaitingTiebreaker} color={RED} />
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "NUMBER", "TYPE", "VOTES", "SINCE"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: TEXT_FAINT }}>Loading…</td></tr>
              )}
              {!loading && consensus.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: TEXT_FAINT }}>No open cases.</td></tr>
              )}
              {!loading && consensus.map(row => {
                const a = Number(row.approvals) || 0;
                const r = Number(row.rejections) || 0;
                return (
                  <tr key={row.id}>
                    <td style={{ ...tdS, color: BLUE, fontFamily: MONO }}>
                      {row.id.slice(0, 12)}
                    </td>
                    <td style={{ ...tdS, color: TEXT_PRIMARY, fontFamily: MONO }}>
                      {row.number}
                    </td>
                    <td style={{ ...tdS, color: TEXT_MUTED }}>
                      {row.type}
                    </td>
                    <td style={tdS}>
                      {a > 0 && <VoteChip kind="approve" count={a} />}
                      {r > 0 && <VoteChip kind="reject"  count={r} />}
                      {a === 0 && r === 0 && (
                        <span style={{ color: TEXT_FAINT, fontSize: "11px" }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tdS, color: TEXT_FAINT, fontSize: "11px" }}>
                      {row.since}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent decisions card */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_PRIMARY, marginBottom: "4px" }}>
            Recent Decisions
          </div>
          <div style={{ fontSize: "11px", color: TEXT_FAINT, marginBottom: "14px" }}>
            Your last 3 approve / reject actions
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["ID", "NUMBER", "TYPE", "DECISION", "TIMESTAMP"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: TEXT_FAINT }}>Loading…</td></tr>
              )}
              {!loading && decisions.length === 0 && (
                <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: TEXT_FAINT }}>No decisions yet.</td></tr>
              )}
              {!loading && decisions.map(row => {
                const isApproved = row.decision === "Approved";
                const color = isApproved ? GREEN : RED;
                const bg    = isApproved ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
                const bd    = isApproved ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)";
                return (
                  <tr key={row.id}>
                    <td style={{ ...tdS, color: BLUE, fontFamily: MONO }}>
                      {row.id.slice(0, 12)}
                    </td>
                    <td style={{ ...tdS, color: TEXT_PRIMARY, fontFamily: MONO }}>
                      {row.number}
                    </td>
                    <td style={{ ...tdS, color: TEXT_MUTED }}>
                      {row.type}
                    </td>
                    <td style={tdS}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "3px 9px",
                          borderRadius: "999px",
                          fontSize: "10px",
                          fontWeight: 700,
                          fontFamily: MONO,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          color,
                          background: bg,
                          border: `1px solid ${bd}`,
                        }}
                      >
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color, display: "inline-block" }} />
                        {row.decision}
                      </span>
                    </td>
                    <td style={{ ...tdS, color: TEXT_FAINT, fontFamily: MONO, fontSize: "11px" }}>
                      {row.ts}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes cardFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}