// src/pages/Analyst-Tabs/AlertsConfiguration.jsx
const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const THRESHOLDS = [
  { id: "T-001", metric: "Report Volume Spike",    condition: "Any region >50% WoW increase",         current: "50%",          rec: "40%",          status: "Approved" },
  { id: "T-002", metric: "AI Accuracy Drift",      condition: "Rolling 7-day accuracy drops below",   current: "85%",          rec: "87%",          status: "Approved" },
  { id: "T-003", metric: "Flagged Report Backlog", condition: "Flagged queue exceeds threshold",       current: "500 reports",  rec: "300 reports",  status: "Approved" },
  { id: "T-004", metric: "New Scam Type Emergence",condition: "Unclassified cluster exceeds threshold",current: "200 reports",  rec: "150 reports",  status: "Approved" },
  { id: "T-005", metric: "Consensus Timeout",      condition: "Case awaits 2nd vote past deadline",   current: "48 hours",     rec: "24 hours",     status: "Approved" },
];

const PENDING = [
  { id: "REC-011", metric: "Report Volume Spike", rec: "Reduce threshold from 50% to 35% — Aug surge in Region IV-A", submitted: "Aug 27", analyst: "A. Mercado" },
  { id: "REC-010", metric: "New Scam Type",        rec: "Add alert for unclassified clusters >100 reports within 6 hours", submitted: "Aug 20", analyst: "A. Mercado" },
];

export default function AlertsConfiguration() {
  const card = { borderRadius: "12px", padding: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
  const tdS  = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Read-only warning */}
      <div style={{ padding: "14px 16px", borderRadius: "12px", display: "flex", gap: "12px", background: "#1a1500", border: "1px solid #f59e0b40" }}>
        <span style={{ color: "#f59e0b", flexShrink: 0, display: "flex" }}><WarningIcon /></span>
        <p style={{ fontSize: "12px", color: "#d97706", lineHeight: 1.6, margin: 0 }}>
          Analyst read-only mode. You may submit recommendations, but all threshold changes require sign-off from an NBI Officer or Project Manager before taking effect.
        </p>
      </div>

      {/* Active thresholds */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Active Alert Thresholds</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Current approved configuration</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["ID","METRIC","CONDITION","CURRENT VALUE","YOUR RECOMMENDATION","STATUS"].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {THRESHOLDS.map((t) => (
              <tr key={t.id}>
                <td style={{ ...tdS, color: "#a855f7", fontFamily: "'JetBrains Mono',monospace" }}>{t.id}</td>
                <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{t.metric}</td>
                <td style={{ ...tdS, color: "#6b7280" }}>{t.condition}</td>
                <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{t.current}</td>
                <td style={{ ...tdS, color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace" }}>{t.rec}</td>
                <td style={tdS}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "#22c55e" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending recommendations */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Pending Recommendations</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Your submitted changes awaiting officer approval</div>
        {PENDING.map((p) => (
          <div key={p.id} style={{ padding: "14px", borderRadius: "10px", marginBottom: "10px", background: "#080810", border: "1px solid #13131e" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#a855f7", fontFamily: "'JetBrains Mono',monospace" }}>{p.id} · {p.metric}</span>
              <span style={{ fontSize: "10px", color: "#f59e0b", background: "#3a2a10", padding: "2px 8px", borderRadius: "4px" }}>Pending Review</span>
            </div>
            <p style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.6, margin: 0 }}>{p.rec}</p>
            <div style={{ fontSize: "11px", marginTop: "8px", color: "#374151" }}>Submitted {p.submitted} by {p.analyst}</div>
          </div>
        ))}
        <button style={{ width: "100%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, background: "#111120", border: "1px dashed #1a1a2a", color: "#6b7280", cursor: "pointer", marginTop: "4px" }}>
          + Submit New Recommendation
        </button>
      </div>

    </div>
  );
}