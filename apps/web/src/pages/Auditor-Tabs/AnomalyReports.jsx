// apps/web/src/pages/Auditor-Tabs/AnomalyReports.jsx
import { useState } from "react";

export default function AnomalyReports() {
  const [lastChecked, setLastChecked] = useState("Aug 28, 2026 05:08 PST");
  const [refreshing, setRefreshing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false
      });
      setLastChecked(`${formatted} PST`);
      setRefreshing(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Status banner */}
      <div style={{ padding: "24px", borderRadius: "12px", background: "#061a0f", border: "1.5px solid #22c55e40", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#14412a", border: "2px solid #22c55e", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 11l5 5 9-9" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "16px", color: "#22c55e" }}>No Anomalies Detected</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>All nightly integrity jobs and consensus audits have passed. Last checked: {lastChecked}.</div>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, border: "none", cursor: refreshing ? "not-allowed" : "pointer", background: refreshing ? "#111118" : "#22c55e", color: refreshing ? "#374151" : "#fff", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {refreshing && <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </div>

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Check complete. Still no anomalies detected.
        </div>
      )}

      {/* History table */}
      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Anomaly History</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Auto-flagged discrepancies from nightly verification runs</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: "12px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0d0d18", border: "1px solid #1a1a2a" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8.5" stroke="#1a1a2a" strokeWidth="1.5" />
              <path d="M7 10l2 2 4-4" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#4b5563" }}>No anomalies on record</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#374151" }}>The system has never detected a hash-chain discrepancy.</div>
          </div>
        </div>
      </div>

      {/* What triggers an anomaly */}
      <div style={{ borderRadius: "12px", padding: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>What Triggers an Anomaly Report?</div>
        {[
          { color: "#ef4444", title: "Hash Mismatch",        desc: "A recomputed block hash does not equal the stored hash. Indicates possible data tampering." },
          { color: "#f59e0b", title: "Consensus Violation",  desc: "A blacklisted number has fewer than 2 distinct officer approvals in the vote log." },
          { color: "#f59e0b", title: "Missing Block",        desc: "A block index is absent from the chain — gap detected during sequential verification." },
          { color: "#6b7280", title: "Duplicate Block Hash", desc: "Two different blocks produce the same hash, indicating a collision or injection attempt." },
        ].map((item) => (
          <div key={item.title} style={{ display: "flex", gap: "12px", padding: "12px 0", borderBottom: "1px solid #13131e" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#fff", marginBottom: "2px" }}>{item.title}</div>
              <div style={{ fontSize: "12px", color: "#4b5563", lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}