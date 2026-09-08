// apps/web/src/pages/AuditorDashboard.jsx
import React from "react";

const ranges = [
  { range: "Block #1–400,000",          records: "400,000", at: "Aug 28 05:00", dur: "2m 41s" },
  { range: "Block #400,001–800,000",    records: "400,000", at: "Aug 28 05:03", dur: "2m 38s" },
  { range: "Block #800,001–1,200,000",  records: "400,000", at: "Aug 28 05:05", dur: "2m 44s" },
  { range: "Block #1,200,001–1,204,881",records: "4,881",   at: "Aug 28 05:08", dur: "0m 12s" },
];
const consensus = [
  { week: "Aug 1–7",   entries: 312, anomalies: 0 },
  { week: "Aug 8–14",  entries: 418, anomalies: 0 },
  { week: "Aug 15–21", entries: 501, anomalies: 0 },
  { week: "Aug 22–28", entries: 487, anomalies: 0 },
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function AuditorDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* VERIFIED hero */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px", borderRadius: "12px", background: "#061a0f", border: "1.5px solid #22c55e40" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#14412a", border: "2px solid #22c55e", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "18px", color: "#22c55e" }}>Hash-Chain Integrity: VERIFIED</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>1,204,881 blocks verified across 4 ranges — 0 discrepancies detected</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>
          <div>Last recompute: Aug 28, 2026 05:08 PST</div>
          <div>Next scheduled: Aug 29, 2026 05:00 PST</div>
        </div>
      </div>

      {/* Range table */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Chain Health — Range-by-Range</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Nightly full recompute of Hₙ = SHA-256(Hₙ₋₁ + data + timestamp)</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["RANGE","RECORDS","STATUS","RECOMPUTED AT","DURATION","HASH MATCH"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {ranges.map(r => (
              <tr key={r.range}>
                <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{r.range}</td>
                <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{r.records}</td>
                <td style={tdS}><span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e", fontWeight: 600 }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />PASS</span></td>
                <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{r.at}</td>
                <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{r.dur}</td>
                <td style={{ ...tdS, color: "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>Hₙ verified ✓</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Discrepancy + Consensus */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Discrepancy Alert Widget</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", borderRadius: "12px", background: "#080810", border: "1px solid #13131e" }}>
            <div style={{ fontSize: "56px", fontWeight: 800, color: "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>0</div>
            <div style={{ fontWeight: 600, color: "#22c55e", marginTop: "8px" }}>No discrepancies detected</div>
            <div style={{ fontSize: "11px", color: "#374151", marginTop: "4px" }}>Last checked: Aug 28 05:08 PST</div>
          </div>
        </div>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Officer Consensus Audit</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Verify all blacklist entries have ≥2 distinct officer approvals</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["WEEK","ENTRIES","ALL ≥2 VOTES","ANOMALIES"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {consensus.map(r => (
                <tr key={r.week}>
                  <td style={{ ...tdS, color: "#fff" }}>{r.week}</td>
                  <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{r.entries}</td>
                  <td style={{ ...tdS, fontWeight: 600, color: "#22c55e" }}>✓ YES</td>
                  <td style={{ ...tdS, color: "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>{r.anomalies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}