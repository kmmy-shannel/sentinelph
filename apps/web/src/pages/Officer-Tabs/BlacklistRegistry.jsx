// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
import { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
    <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function mapEntryToRow(e) {
  const votes = e.votes || [];
  const approvingOfficers = votes
    .filter(v => v.decision === 'approve')
    .map(v => (v.officerId || v.userId || '').slice(-6) || '—')
    .join(' · ') || '—';
  const decisionDate = e.resolvedAt || e.updatedAt
    ? new Date(e.resolvedAt || e.updatedAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  return {
    id: e._id ? String(e._id).slice(-6).toUpperCase() : "—",
    number: e.phoneNumber || "—",
    type: e.scamType || "UNKNOWN",
    reports: e.reportCount ?? 0,
    status: 'Blocked',
    rawStatus: e.status,
    officers: approvingOfficers,
    date: decisionDate,
    hash: e.hash || '—',
    notes: e.notes || 'No officer notes recorded.',
  };
}

export default function BlacklistRegistry() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/v1/blacklist', { params: { limit: 100 } });
      setEntries((data.data ?? []).map(mapEntryToRow));
    } catch (err) {
      console.error('[BlacklistRegistry] fetch failed:', err);
      setError(err?.response?.data?.message || 'Failed to load blacklist registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // ── Optimistic UI: hide the sidebar badge INSTANTLY ────────────────
    if (window.__clearSidebarBadge) {
      window.__clearSidebarBadge('registry');
    }

    loadEntries();

    // Fire the "seen" POST. On success or failure, sync the true count
    // from the server in the background (no visible delay either way).
    apiClient.post('/api/v1/stats/seen/blacklist')
      .then(() => window.dispatchEvent(new CustomEvent('badges:refresh')))
      .catch(() => window.dispatchEvent(new CustomEvent('badges:refresh')));
  }, [loadEntries]);

  const filtered = entries.filter((e) => {
    const matchFilter = filter === "all" || e.status.toLowerCase() === filter;
    const q = search.toLowerCase();
    const matchSearch = !search || e.number.includes(search) || e.type.toLowerCase().includes(q) || e.id.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  function handleExportCSV() {
    const headers = ["Block ID", "Number", "Scam Type", "Reports", "Status", "Approving Officers", "Decision Date", "Hash"];
    const rows = filtered.map(e => [e.id, e.number, e.type, e.reports, e.status, e.officers, e.date, e.hash]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinelph-blacklist-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 3000);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "280px" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <SearchIcon />
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, type, ID…"
            style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {["all", "blocked"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: filter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: filter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={handleExportCSV}
          style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#6b7280" }}>
          Export CSV
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {showExportSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          CSV exported successfully. Check your downloads folder.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Blacklist Registry</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>
            {loading ? "Loading…" : `${filtered.length} entries · Click any row for details`}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["BLOCK ID","NUMBER","SCAM TYPE","REPORTS","STATUS","APPROVING OFFICERS","DECISION DATE"].map((h) => (
                <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading registry…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No entries in this view.</td></tr>}
            {!loading && filtered.map((row) => (
              <tr key={row.number}
                onClick={() => setSelectedCase(row)}
                style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af" }}>{row.type}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                <td style={{ padding: "12px 20px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#ef4444" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                    Blocked
                  </span>
                </td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.officers}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{row.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedCase && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,#ef4444,transparent)` }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>{selectedCase.id}</div>
                <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.number}</div>
              </div>
              <button onClick={() => setSelectedCase(null)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon color="#4b5563" />
              </button>
            </div>
            <div style={{ display: "inline-block", marginBottom: "20px", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#ef444420", color: "#ef4444" }}>
              Blocked
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: "20px" }}>
              {[
                { l: "SCAM TYPE", v: selectedCase.type },
                { l: "TOTAL REPORTS", v: selectedCase.reports },
                { l: "APPROVING OFFICERS", v: selectedCase.officers },
                { l: "DECISION DATE", v: selectedCase.date, mono: true },
              ].map(f => (
                <div key={f.l}>
                  <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{f.l}</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontFamily: f.mono ? "'JetBrains Mono',monospace" : "inherit" }}>{f.v}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>BLOCK HASH</div>
              <div style={{ fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-all" }}>{selectedCase.hash}</div>
            </div>
            <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>OFFICER NOTES</div>
              <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.7 }}>{selectedCase.notes}</div>
            </div>
            <button onClick={() => setSelectedCase(null)}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: "#1a1a2a", color: "#fff", cursor: "pointer" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}