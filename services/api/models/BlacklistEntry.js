// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../lib/api";

const PAGE_SIZE = 20;
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 50;
const SEARCH_DEBOUNCE_MS = 350;

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

// `status` is sent to GET /api/v1/blacklist (comma list = any of).
const FILTERS = [
  { id: "all",      label: "All",          status: null },
  { id: "blocked",  label: "Blocked",      status: "blacklisted" },
  { id: "review",   label: "Under Review", status: "pending,under_review,one_approval" },
  { id: "rejected", label: "Rejected",     status: "rejected" },
];

function statusPresentation(rawStatus) {
  if (rawStatus === "blacklisted") return { label: "Blocked", color: "#ef4444" };
  if (rawStatus === "rejected") return { label: "Rejected", color: "#f59e0b" };
  return { label: "Under Review", color: "#60a5fa" };
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Officers are stored as Firebase UIDs; show a short, stable form in the UI.
function shortOfficerId(uid) {
  const value = String(uid || "");
  return value.length > 8 ? `${value.slice(0, 6)}…` : value;
}

// Maps a BlacklistEntry document (services/api/models/BlacklistEntry.js) to
// the row shape this screen renders. Accepts both `phoneNumber` and `entity`,
// and both `approvingOfficers` and the legacy `approvedBy`.
function mapEntryToRow(e) {
  const rawId = String(e._id || e.id || e.phoneNumber || e.entity || "");
  const officerIds = Array.isArray(e.approvingOfficers)
    ? e.approvingOfficers
    : Array.isArray(e.approvedBy)
    ? e.approvedBy
    : [];
  const presentation = statusPresentation(e.status);

  return {
    key: rawId,
    id: `BLK-${rawId.slice(-6).toUpperCase()}`,
    number: e.phoneNumber || e.entity || "Unknown",
    type: e.scamType || "UNKNOWN",
    reports: e.reportCount ?? 0,
    rawStatus: e.status,
    status: presentation.label,
    statusColor: presentation.color,
    officerIds,
    officers: officerIds.length > 0 ? officerIds.map(shortOfficerId).join(" · ") : "—",
    date: formatDate(e.blacklistedAt || e.updatedAt),
    hash: e.hash || "—",
    notes: e.notes || "No officer notes recorded.",
  };
}

// CSV cell writer. Sender numbers and notes originate from citizens and
// officers, so a value that starts with = + - @ (or a tab / CR) would be run
// as a formula when the file is opened in Excel/Sheets (CSV injection).
// Such cells are prefixed with an apostrophe, and quotes are doubled.
function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function extractErrorMessage(err, fallback) {
  const data = err?.response?.data;
  const nested = data?.error && typeof data.error === "object" ? data.error.message : null;
  const flat = typeof data?.error === "string" ? data.error : null;
  return nested || data?.message || flat || err?.message || fallback;
}

export default function BlacklistRegistry() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedCase, setSelectedCase] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const loadSeqRef = useRef(0);

  // Debounce the search box so we query once per pause, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const buildFilterParams = useCallback(() => {
    const params = {};
    const active = FILTERS.find((f) => f.id === filter);
    if (active?.status) params.status = active.status;
    if (debouncedSearch) params.q = debouncedSearch;
    return params;
  }, [filter, debouncedSearch]);

  const loadEntries = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get("/api/v1/blacklist", {
        params: { ...buildFilterParams(), page, limit: PAGE_SIZE },
      });
      if (seq !== loadSeqRef.current) return;

      const items = Array.isArray(data?.data) ? data.data : [];
      const serverPagination = data?.pagination;

      // The last entry on the last page disappeared: step back a page.
      if (serverPagination && serverPagination.totalPages >= 1 && page > serverPagination.totalPages) {
        setPage(serverPagination.totalPages);
        return;
      }

      setRows(items.map(mapEntryToRow));
      setPagination({
        total: serverPagination?.total ?? items.length,
        totalPages: serverPagination?.totalPages ?? 1,
      });
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(extractErrorMessage(err, "Failed to load the blacklist registry."));
      setRows([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [buildFilterParams, page]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  function changeFilter(nextFilter) {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setPage(1);
  }

  // Exports EVERY entry matching the current filter/search (not just the
  // visible page) by walking the paginated API.
  async function handleExportCSV() {
    setExporting(true);
    setError(null);
    try {
      const all = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
        const { data } = await apiClient.get("/api/v1/blacklist", {
          params: { ...buildFilterParams(), page: p, limit: EXPORT_PAGE_SIZE },
        });
        const items = Array.isArray(data?.data) ? data.data : [];
        all.push(...items.map(mapEntryToRow));
        const totalPages = data?.pagination?.totalPages ?? 1;
        if (p >= totalPages) break;
      }

      const headers = ["Block ID", "Number", "Scam Type", "Reports", "Status", "Approving Officers", "Decision Date", "Hash"];
      const csvRows = all.map((e) => [
        e.id, e.number, e.type, e.reports, e.status, e.officerIds.join(" · "), e.date, e.hash,
      ]);
      const csvContent = [headers, ...csvRows].map((r) => r.map(csvCell).join(",")).join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentinelph-blacklist-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      setShowExportSuccess(true);
      setTimeout(() => setShowExportSuccess(false), 3000);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to export the registry."));
    } finally {
      setExporting(false);
    }
  }

  const totalItems = pagination.total;
  const totalPages = pagination.totalPages;
  const rangeFrom = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(page * PAGE_SIZE, totalItems);
  const canPrev = page > 1 && !loading;
  const canNext = page < totalPages && !loading;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "280px", minWidth: "200px" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <SearchIcon />
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number or scam type…"
            style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => changeFilter(f.id)}
              style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: filter === f.id ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: filter === f.id ? "#e2e8f0" : "#4b5563" }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={handleExportCSV} disabled={exporting}
          style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: exporting ? "not-allowed" : "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: exporting ? "#374151" : "#6b7280" }}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#1a0a0a", border: "1px solid #ef444440", color: "#ef4444" }}>
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
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>{totalItems} entries · Click any row for details</div>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
                  {loading ? "Loading registry…" : "No entries in this view."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}
                  onClick={() => setSelectedCase(row)}
                  style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af" }}>{row.type}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: row.statusColor }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: row.statusColor, display: "inline-block" }} />
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{row.officers}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{row.date}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", padding: "12px 20px", borderTop: "1px solid #1a1a2a" }}>
          <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
            {totalItems === 0 ? "0 entries" : `${rangeFrom}–${rangeTo} of ${totalItems}`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: canPrev ? "#9ca3af" : "#374151", cursor: canPrev ? "pointer" : "not-allowed" }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>
              Page {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!canNext}
              style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: canNext ? "#9ca3af" : "#374151", cursor: canNext ? "pointer" : "not-allowed" }}
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Case Detail Modal - Click outside NO LONGER closes it */}
      {selectedCase && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${selectedCase.statusColor},transparent)` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>{selectedCase.id}</div>
                <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.number}</div>
              </div>
              <button onClick={() => setSelectedCase(null)} aria-label="Close" style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon color="#4b5563" />
              </button>
            </div>

            <div style={{ display: "inline-block", marginBottom: "20px", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: `${selectedCase.statusColor}20`, color: selectedCase.statusColor }}>
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
                <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-all" }}>{selectedCase.officerIds.length > 0 ? selectedCase.officerIds.join(" · ") : "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>DECISION DATE</div>
                <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.date}</div>
              </div>
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

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}