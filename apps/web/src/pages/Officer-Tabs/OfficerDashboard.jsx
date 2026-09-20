// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
//
// FIX: this page previously rendered a hardcoded `REGISTRY` array with
// fake IDs, hashes, and officer names — it never called the backend. A
// real GET /api/v1/blacklist endpoint already exists
// (services/api/routes/blacklist.js) and is populated automatically by
// services/api/routes/reports.js's auto-candidate logic on every citizen
// submission. This page now fetches from that endpoint instead.
//
// NOTE: BlacklistEntry's exact Mongoose schema wasn't available when this
// was written — only the fields blacklist.js's route handlers are
// confirmed to read/write: phoneNumber, region, status, reportCount,
// blacklistedAt. Columns that depend on fields not confirmed to exist on
// the model (scam type, approving officers, a block hash, officer notes)
// are read defensively with fallback aliases and hidden/blanked when
// absent, following the same defensive-mapping convention ReviewQueue.jsx
// already uses in its mapReportToRow(). If you share
// services/api/models/BlacklistEntry.js, this can be tightened to the
// exact real field names instead of guessing at aliases.

import { useCallback, useEffect, useMemo, useState } from "react";
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

// BlacklistRegistry is scoped to *resolved* outcomes only (matches this
// page's original intent — the hardcoded REGISTRY only ever contained
// Blocked/Rejected rows, never pending/under_review candidates).
const RESOLVED_STATUSES = ["blacklisted", "rejected"];

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Maps a raw BlacklistEntry document (from GET /api/v1/blacklist) into
 * the row shape this page renders. Confirmed fields (phoneNumber, region,
 * status, reportCount, blacklistedAt) are read directly; everything else
 * is read defensively via multiple possible aliases with a safe fallback,
 * so an unexpected schema shape degrades gracefully instead of crashing.
 */
function mapEntryToRow(e) {
  const id = e._id || e.id || e.phoneNumber || "unknown";
  const rawStatus = (e.status || "pending").toLowerCase();
  const displayStatus =
    rawStatus === "blacklisted" ? "Blocked" :
    rawStatus === "rejected"    ? "Rejected" :
    rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  const votes = Array.isArray(e.votes) ? e.votes : [];
  const officers = votes.length > 0
    ? votes.map((v) => v.role || v.userId || v.officerId || "Officer").join(" · ")
    : (e.officers || e.approvingOfficers || "—");
  const notes = votes.length > 0
    ? votes.map((v) => v.comment).filter(Boolean).join(" | ")
    : (e.notes || e.officerNotes || "");

  return {
    id: String(id),
    number: e.phoneNumber || e.number || "Unknown",
    type: e.scamType || e.category || e.type || "UNKNOWN",
    reports: e.reportCount ?? e.reports ?? 0,
    status: displayStatus,
    rawStatus,
    officers,
    date: formatDate(e.blacklistedAt || e.updatedAt || e.createdAt),
    hash: e.hash || e.blockHash || null,
    notes,
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
      const { data: res } = await apiClient.get("/api/v1/blacklist", {
        params: { limit: 200 },
      });
      const list = Array.isArray(res) ? res : res.data || [];
      const resolvedOnly = list
        .map(mapEntryToRow)
        .filter((row) => RESOLVED_STATUSES.includes(row.rawStatus));
      setEntries(resolvedOnly);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load the blacklist registry.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const matchFilter = filter === "all" || e.status.toLowerCase() === filter;
      const matchSearch =
        !search ||
        e.number.includes(search) ||
        e.type.toLowerCase().includes(search.toLowerCase()) ||
        e.id.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [entries, filter, search]);

  function handleExportCSV() {
    const headers = ["Entry ID", "Number", "Scam Type", "Reports", "Status", "Approving Officers", "Decision Date"];
    const rows = filtered.map((e) => [e.id, e.number, e.type, e.reports, e.status, e.officers, e.date]);
    const csvContent = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinelph-blacklist-${new Date().toISOString().slice(0, 10)}.csv`;
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
          {["all", "blocked", "rejected"].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: filter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: filter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={loadEntries}
          disabled={loading}
          style={{ padding: "8px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", color: loading ? "#374151" : "#9ca3af", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button onClick={handleExportCSV}
          style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#6b7280" }}>
          Export CSV
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {showExportSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
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
              {["BLOCK ID", "NUMBER", "SCAM TYPE", "REPORTS", "STATUS", "APPROVING OFFICERS", "DECISION DATE"].map((h) => (
                <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
                  {loading ? "Loading registry…" : "No entries in this view."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}
                  onClick={() => setSelectedCase(row)}
                  style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id.slice(0, 12)}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af" }}>{row.type}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: row.status === "Blocked" ? "#ef4444" : "#f59e0b" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: row.status === "Blocked" ? "#ef4444" : "#f59e0b", display: "inline-block" }} />
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.officers}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{row.date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedCase && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${selectedCase.status === "Blocked" ? "#ef4444" : "#f59e0b"},transparent)` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>{selectedCase.id.slice(0, 12)}</div>
                <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.number}</div>
              </div>
              <button onClick={() => setSelectedCase(null)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon color="#4b5563" />
              </button>
            </div>

            <div style={{ display: "inline-block", marginBottom: "20px", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: selectedCase.status === "Blocked" ? "#ef444420" : "#f59e0b20", color: selectedCase.status === "Blocked" ? "#ef4444" : "#f59e0b" }}>
              {selectedCase.status}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>SCAM TYPE</div>
                <div style={{ fontSize: "13px", color: "#fff" }}>{selectedCase.type}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>TOTAL REPORTS</div>
                <div style={{ fontSize: "13px", color: "#fff" }}>{selectedCase.reports}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>APPROVING OFFICERS</div>
                <div style={{ fontSize: "13px", color: "#fff" }}>{selectedCase.officers}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>DECISION DATE</div>
                <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.date}</div>
              </div>
            </div>

            {selectedCase.hash && (
              <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>BLOCK HASH</div>
                <div style={{ fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-all" }}>{selectedCase.hash}</div>
              </div>
            )}

            <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>OFFICER NOTES</div>
              <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.7 }}>{selectedCase.notes || "No notes recorded."}</div>
            </div>

            <button onClick={() => setSelectedCase(null)}
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