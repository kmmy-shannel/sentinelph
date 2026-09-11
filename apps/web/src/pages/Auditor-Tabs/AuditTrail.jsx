// apps/web/src/pages/Auditor-Tabs/AuditTrail.jsx
import { useState } from "react";

const CloseIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ALL_EVENTS = [
  { ts: "Aug 28 09:22", actor: "Dr. J. Santos",    role: "Auditor", action: "Manual verification triggered",           target: "#1–#1,204,881",   hash: "a3f9e2c1b847...", notes: "Full chain recompute performed after the nightly job. All hashes matched stored values." },
  { ts: "Aug 28 09:18", actor: "System",            role: "Auto",    action: "Consensus alert dispatched",              target: "RPT-09415",        hash: "", notes: "Automated alert: case pending 2nd vote for over 6 hours." },
  { ts: "Aug 28 08:52", actor: "Insp. Cruz, R.",    role: "Officer", action: "Number blacklisted (2nd approval)",       target: "+63 998 011 2233", hash: "8a21c9e3b04...", notes: "Second approval completed. Block hash written to chain." },
  { ts: "Aug 28 08:41", actor: "Ana Mercado",       role: "Analyst", action: "Bulk CSV export generated",              target: "Regional Report",  hash: "", notes: "Exported NCR regional report for Aug 2026." },
  { ts: "Aug 28 08:00", actor: "System",            role: "Auto",    action: "Nightly hash-chain verification done",   target: "1,204,881 blocks", hash: "f7d3a1e09c2...", notes: "Scheduled job completed. 0 discrepancies detected." },
  { ts: "Aug 27 22:45", actor: "Ofc. Bautista, L.",role: "Officer", action: "Number blacklisted (2nd approval)",       target: "+63 905 338 8810", hash: "3b8e7f2a104...", notes: "Second approval. Confirmed LBC customs fee scam." },
  { ts: "Aug 27 21:18", actor: "Insp. Cruz, R.",    role: "Officer", action: "Number blacklisted (1st vote)",          target: "+63 943 112 5560", hash: "", notes: "First vote submitted. Awaiting second approval." },
  { ts: "Aug 27 18:22", actor: "Insp. Cruz, R.",    role: "Officer", action: "Report rejected",                        target: "RPT-09393",        hash: "", notes: "Insufficient evidence to blacklist this number." },
  { ts: "Aug 27 15:05", actor: "Ofc. Santos, P.",  role: "Officer", action: "Number blacklisted (2nd approval)",       target: "+63 933 441 8881", hash: "c12d8b4e573...", notes: "Second approval. High-volume investment scam." },
  { ts: "Aug 27 12:33", actor: "Insp. Cruz, R.",    role: "Officer", action: "Report escalated",                       target: "RPT-09372",        hash: "", notes: "Escalated to senior officer for review." },
];

const ROLE_STYLE = {
  Officer: { bg: "#3b82f620", color: "#3b82f6" },
  Analyst: { bg: "#a855f720", color: "#a855f7" },
  Auditor: { bg: "#22c55e20", color: "#22c55e" },
  Auto:    { bg: "#1a1a2a",   color: "#4b5563" },
};

export default function AuditTrail() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const filtered = ALL_EVENTS.filter((e) => {
    const matchRole   = roleFilter === "all" || e.role.toLowerCase() === roleFilter;
    const matchSearch = !search || e.actor.toLowerCase().includes(search.toLowerCase()) || e.action.toLowerCase().includes(search.toLowerCase()) || e.target.toLowerCase().includes(search.toLowerCase());
    return matchRole && matchSearch;
  });

  function handleExportCSV() {
    const headers = ["Timestamp", "Actor", "Role", "Action", "Target", "Block Hash"];
    const rows = filtered.map(e => [e.ts, e.actor, e.role, e.action, e.target, e.hash]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinelph-audit-trail-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 3000);
  }

  const thS = { padding: "12px 20px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "300px" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
            <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actor, action, target…"
            style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
        </div>
        {["all","officer","analyst","auditor","auto"].map((r) => (
          <button key={r} onClick={() => setRoleFilter(r)}
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: roleFilter === r ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: roleFilter === r ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
            {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
        <button onClick={handleExportCSV} style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", cursor: "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#6b7280" }}>Export CSV</button>
      </div>

      {showExportSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          CSV exported successfully. Check your downloads folder.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Event Log</div>
          <span style={{ fontSize: "11px", color: "#4b5563" }}>Append-only · {filtered.length} events shown · Click row for details</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["TIMESTAMP","ACTOR","ROLE","ACTION","TARGET","BLOCK HASH"].map((h) => <th key={h} style={thS}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const rs = ROLE_STYLE[e.role] ?? ROLE_STYLE.Auto;
              return (
                <tr key={i} 
                  onClick={() => setSelectedEvent(e)}
                  style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
                  onMouseEnter={(el) => el.currentTarget.style.background = "#111120"}
                  onMouseLeave={(el) => el.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "10px 20px", fontSize: "12px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{e.ts}</td>
                  <td style={{ padding: "10px 20px", fontSize: "12px", fontWeight: 500, color: "#fff" }}>{e.actor}</td>
                  <td style={{ padding: "10px 20px" }}><span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: rs.bg, color: rs.color }}>{e.role}</span></td>
                  <td style={{ padding: "10px 20px", fontSize: "12px", color: "#9ca3af" }}>{e.action}</td>
                  <td style={{ padding: "10px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{e.target}</td>
                  <td style={{ padding: "10px 20px", fontSize: "12px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>{e.hash || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#22c55e,transparent)" }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>Event Detail</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{selectedEvent.ts}</div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon color="#4b5563" />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>ACTOR</div>
                <div style={{ fontSize: "13px", color: "#fff" }}>{selectedEvent.actor}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>ROLE</div>
                <div style={{ fontSize: "13px", color: "#fff" }}>{selectedEvent.role}</div>
              </div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>ACTION</div>
              <div style={{ fontSize: "13px", color: "#fff" }}>{selectedEvent.action}</div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>TARGET</div>
              <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{selectedEvent.target}</div>
            </div>

            <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>OFFICER NOTES</div>
              <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.7 }}>{selectedEvent.notes}</div>
            </div>

            <button onClick={() => setSelectedEvent(null)}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: "#1a1a2a", color: "#fff", cursor: "pointer" }}>
              Close
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