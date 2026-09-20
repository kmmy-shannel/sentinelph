// apps/web/src/pages/Officer-Tabs/OfficerDashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import apiClient from "../../lib/api";

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function OfficerDashboard() {
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showSuccess, setShowSuccess]   = useState(false);
  const [resolvedIds, setResolvedIds]   = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get('/api/v1/officer/dashboard');
      setData(res.data);
    } catch (err) {
      console.error('[OfficerDashboard] load failed:', err);
      setError(err?.response?.data?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const kpis      = data?.kpis ?? { pendingVote: 0, consensusNeeded: 0, resolvedThisWeek: 0 };
  const trend     = data?.trend ?? [];
  const heatmap   = data?.heatmap ?? [];
  const consensus = (data?.consensusItems ?? []).filter(i => !resolvedIds.includes(i.id));
  const decisions = data?.decisions ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        {[
          { l: "PENDING YOUR VOTE",      v: kpis.pendingVote,       sub: "Awaiting your review",         sc: "#ef4444" },
          { l: "CONSENSUS NEEDED (1/2)", v: kpis.consensusNeeded,   sub: "Second vote to finalize block",sc: "#f59e0b" },
          { l: "RESOLVED THIS WEEK",     v: kpis.resolvedThisWeek,  sub: "Last 7 days",                  sc: "#22c55e" },
        ].map(s => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>{s.l}</div>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "#fff", marginBottom: "4px", fontFamily: "'JetBrains Mono',monospace" }}>
              {loading ? "—" : s.v}
            </div>
            <div style={{ fontSize: "12px", color: s.sc }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Vote submitted successfully.
        </div>
      )}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>7-Day Report Trend</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Daily incoming reports, your jurisdiction</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={2} fill="url(#blueGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Regional Heatmap</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Cumulative reports by jurisdiction</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={heatmap} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {heatmap.map((_, i) => <Cell key={i} fill={`rgba(59,130,246,${Math.max(0.3, 0.9 - i * 0.15)})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Consensus Status — Awaiting 2nd Vote</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>
            {loading ? "Loading…" : `${consensus.length} case${consensus.length === 1 ? '' : 's'} need a second independent approval`}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["ID","NUMBER","TYPE","VOTES","SINCE"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: "#4b5563" }}>Loading…</td></tr>}
              {!loading && consensus.length === 0 && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: "#4b5563" }}>No cases awaiting a second vote.</td></tr>}
              {!loading && consensus.map(row => (
                <tr key={row.id}>
                  <td style={{ ...tdS, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id.slice(0, 12)}</td>
                  <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                  <td style={{ ...tdS, color: "#9ca3af" }}>{row.type}</td>
                  <td style={{ ...tdS, color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{row.votes}</td>
                  <td style={{ ...tdS, color: "#6b7280" }}>{row.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Recent Decisions Log</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Your last 3 approve / reject actions</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["ID","NUMBER","TYPE","DECISION","TIMESTAMP"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: "#4b5563" }}>Loading…</td></tr>}
              {!loading && decisions.length === 0 && <tr><td colSpan={5} style={{ ...tdS, textAlign: "center", color: "#4b5563" }}>No decisions yet.</td></tr>}
              {!loading && decisions.map(row => {
                const color = row.decision === "Approved" ? "#22c55e" : "#ef4444";
                const bg = row.decision === "Approved" ? "#14412a" : "#3f1a1a";
                return (
                  <tr key={row.id}>
                    <td style={{ ...tdS, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id.slice(0, 12)}</td>
                    <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                    <td style={{ ...tdS, color: "#9ca3af" }}>{row.type}</td>
                    <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: bg, color }}>{row.decision}</span></td>
                    <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{row.ts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}