// apps/web/src/pages/Officer-Tabs/OfficerDashboard.jsx
import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const trendData = [
  { day: "Aug 22", v: 148 }, { day: "Aug 23", v: 162 }, { day: "Aug 24", v: 175 },
  { day: "Aug 25", v: 190 }, { day: "Aug 26", v: 210 }, { day: "Aug 27", v: 258 }, { day: "Aug 28", v: 312 },
];
const heatmapData = [
  { region: "Quezon City", v: 980 }, { region: "Makati", v: 720 },
  { region: "Pasig", v: 560 }, { region: "Parañaque", v: 410 },
];
const consensusItems = [
  { id: "RPT-09415", number: "+63 956 774 3390", type: "Investment Scam", votes: "1/2", since: "7h ago" },
  { id: "RPT-09398", number: "+63 961 887 3384", type: "Bank Impersonation", votes: "1/2", since: "11h ago" },
  { id: "RPT-09381", number: "+63 927 445 1182", type: "OTP Phishing", votes: "1/2", since: "19h ago" },
];
const decisionsLog = [
  { id: "RPT-09410", number: "+63 905 338 8810", type: "Parcel/Delivery", decision: "Approved", ts: "Aug 27 22:45" },
  { id: "RPT-09407", number: "+63 943 112 5560", type: "Gov't Impersonation", decision: "Approved", ts: "Aug 27 21:18" },
  { id: "RPT-09393", number: "+63 912 778 4430", type: "OTP Phishing", decision: "Rejected", ts: "Aug 27 18:22" },
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function OfficerDashboard() {
  const [voteModal, setVoteModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [resolvedIds, setResolvedIds] = useState([]);

  function closeModal() { setVoteModal(null); setDecision(null); setComment(""); }

  function handleSubmitVote() {
    if (!decision || !comment.trim()) return;
    setResolvedIds(prev => [...prev, voteModal.id]);
    closeModal();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        {[
          { l: "PENDING YOUR VOTE", v: "14", sub: "4 critical — require action", sc: "#ef4444" },
          { l: "CONSENSUS NEEDED (1/2)", v: "6", sub: "Second vote to finalize block", sc: "#f59e0b" },
          { l: "RESOLVED THIS WEEK", v: "47", sub: "+12% vs last week", sc: "#22c55e" },
        ].map(s => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>{s.l}</div>
            <div style={{ fontSize: "36px", fontWeight: 800, color: "#fff", marginBottom: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
            <div style={{ fontSize: "12px", color: s.sc }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Vote submitted successfully. Consensus count updated.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>7-Day Report Trend — NCR</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Daily incoming reports, your jurisdiction</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Regional Heatmap — NCR Districts</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Cumulative reports, Aug 2026</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={heatmapData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {heatmapData.map((_, i) => <Cell key={i} fill={`rgba(59,130,246,${0.9 - i * 0.15})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Consensus Status — Awaiting 2nd Vote</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>{consensusItems.length - resolvedIds.length} cases need a second independent approval</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["ID","NUMBER","TYPE","VOTES","SINCE",""].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {consensusItems.map(row => {
                const isResolved = resolvedIds.includes(row.id);
                return (
                  <tr key={row.id} style={{ opacity: isResolved ? 0.5 : 1 }}>
                    <td style={{ ...tdS, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
                    <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                    <td style={{ ...tdS, color: "#9ca3af" }}>{row.type}</td>
                    <td style={{ ...tdS, color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{row.votes}</td>
                    <td style={{ ...tdS, color: "#6b7280" }}>{row.since}</td>
                    <td style={tdS}>
                      {isResolved ? (
                        <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: 600 }}>✓ Voted</span>
                      ) : (
                        <button onClick={() => setVoteModal(row)} style={{ fontSize: "11px", fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Vote →</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Recent Decisions Log</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Your last 3 approve / reject actions</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["ID","NUMBER","TYPE","DECISION","TIMESTAMP"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {decisionsLog.map(row => {
                const color = row.decision === "Approved" ? "#22c55e" : "#ef4444";
                const bg = row.decision === "Approved" ? "#14412a" : "#3f1a1a";
                return (
                  <tr key={row.id}>
                    <td style={{ ...tdS, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
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

      {/* Vote Modal - Click outside NO LONGER closes it */}
      {voteModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "480px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#3b82f6,transparent)" }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>{voteModal.id}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{voteModal.type} · Awaiting 2nd Vote</div>
              </div>
              <button onClick={closeModal} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{voteModal.number}</div>
              <div style={{ fontSize: "11px", color: "#4b5563" }}>Prior votes: {voteModal.votes} · Submitted {voteModal.since}</div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <button onClick={() => setDecision("approve")}
                style={{ flex: 1, padding: "10px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer", background: decision === "approve" ? "#14412a" : "#111118", border: `1.5px solid ${decision === "approve" ? "#22c55e" : "#1a1a28"}`, color: decision === "approve" ? "#22c55e" : "#4b5563" }}>
                ✓ Approve
              </button>
              <button onClick={() => setDecision("reject")}
                style={{ flex: 1, padding: "10px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer", background: decision === "reject" ? "#3f1a1a" : "#111118", border: `1.5px solid ${decision === "reject" ? "#ef4444" : "#1a1a28"}`, color: decision === "reject" ? "#ef4444" : "#4b5563" }}>
                ✕ Reject
              </button>
            </div>

            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Mandatory: add your reasoning comment…" rows={3}
              style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", outline: "none", resize: "none", marginBottom: "16px", background: "#080810", border: "1px solid #1a1a28", color: "#e2e8f0", boxSizing: "border-box", fontFamily: "inherit" }} />

            <button disabled={!decision || !comment.trim()} onClick={handleSubmitVote}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: decision && comment.trim() ? "#3b82f6" : "#111118", color: decision && comment.trim() ? "#fff" : "#374151", cursor: decision && comment.trim() ? "pointer" : "not-allowed" }}>
              Submit Vote
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}