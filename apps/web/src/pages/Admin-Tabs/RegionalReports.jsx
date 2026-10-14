// apps/web/src/pages/Admin-Tabs/RegionalReports.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import apiClient from "../../lib/api";

// ─── Admin accent (purple) ────────────────────────────────────────────
const A = "#a855f7";
const A_HOVER = "#9333ea";
const A_TINT = "rgba(168,85,247,0.08)";
const A_TINT_BORDER = "rgba(168,85,247,0.30)";

const REGION_OPTIONS = [
  "all", "NCR", "CAR",
  "Region I", "Region II", "Region III", "Region IV-A", "MIMAROPA",
  "Region V", "Region VI", "Region VII", "Region VIII", "Region IX",
  "Region X", "Region XI", "Region XII", "Region XIII", "BARMM",
];

const SCAM_TYPE_OPTIONS = [
  "all", "OTP Phishing", "Bank Impersonation", "Parcel/Delivery",
  "Investment Scam", "Gov't Impersonation",
];

export default function RegionalReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);

  const [region, setRegion] = useState("all");
  const [scamType, setScamType] = useState("all");
  const [dateFrom, setFrom] = useState("");
  const [dateTo, setTo] = useState("");

  const inputS = {
    padding: "9px 12px",
    borderRadius: "8px",
    fontSize: "12px",
    background: "#080810",
    border: "1px solid #1a1a2a",
    color: "#e2e8f0",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    transition: "border-color 0.15s ease",
  };
  const card = {
    borderRadius: "12px",
    padding: "20px",
    background: "#0e0e18",
    border: "1px solid #1a1a2a",
  };
  const thS = {
    textAlign: "left",
    paddingBottom: "10px",
    paddingRight: "16px",
    fontWeight: 600,
    color: "#64748b",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "9px",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  };
  const tdS = {
    padding: "14px 16px 14px 0",
    fontSize: "12px",
    borderTop: "1px solid #13131e",
    verticalAlign: "middle",
  };

  const load = useCallback(async (overrideRegion) => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      const useRegion = overrideRegion !== undefined ? overrideRegion : region;
      if (useRegion !== "all") params.region = useRegion;
      if (scamType !== "all") params.scamType = scamType;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const { data: res } = await apiClient.get("/api/v1/admin/reports", { params });
      setRows(res.data || []);
      setLastGeneratedAt(new Date());
    } catch (err) {
      setError(err?.response?.data?.message || "Could not generate the regional report.");
    } finally {
      setLoading(false);
    }
  }, [region, scamType, dateFrom, dateTo]);

  // Initial load
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function triggerSuccess() {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  function handleGenerateReport() {
    load();
    triggerSuccess();
  }

  function handleExportCSV() {
    const headers = ["Region", "Total Reports", "Top Scam Type", "Latest Report"];
    const body = rows.map((r) => [
      r.region,
      r.reports,
      r.topScamType || "UNKNOWN",
      r.latestReportAt ? new Date(r.latestReportAt).toISOString() : "",
    ]);
    const csv = [headers, ...body].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinelph-regional-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    triggerSuccess();
  }

  function handleExportPDF() {
    window.print();
    triggerSuccess();
  }

  function clearFilters() {
    setRegion("all");
    setScamType("all");
    setFrom("");
    setTo("");
  }

  // ─── Derived metrics ─────────────────────────────────────────────
  const totalReports = useMemo(
    () => rows.reduce((sum, r) => sum + (r.reports || 0), 0),
    [rows]
  );
  const topRegion = rows[0];
  const avgPerRegion = rows.length > 0 ? Math.round(totalReports / rows.length) : 0;
  const activeFilterCount = [
    region !== "all",
    scamType !== "all",
    Boolean(dateFrom),
    Boolean(dateTo),
  ].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ─── Header strip ──────────────────────────────────────────── */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#0a0a12",
          border: "1px solid #1a1a2a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span
            style={{
              color: A,
              fontWeight: 700,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: "11px",
              letterSpacing: "0.08em",
            }}
          >
            ANALYTICS
          </span>
          <span style={{ color: "#374151" }}>·</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            Exportable regional report for agency-wide reporting
          </span>
        </div>
        {lastGeneratedAt && (
          <span
            style={{
              fontSize: "11px",
              color: "#4b5563",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            Last generated {lastGeneratedAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
      </div>

      {/* ─── Filters ──────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "2px" }}>Report Filters</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              {activeFilterCount === 0 ? "Showing all reports" : `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "11px",
                fontWeight: 500,
                color: "#9ca3af",
                background: "transparent",
                border: "1px solid #1a1a2a",
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>REGION</div>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}
            >
              {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r === "all" ? "All Regions" : r}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>SCAM TYPE</div>
            <select
              value={scamType}
              onChange={(e) => setScamType(e.target.value)}
              style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}
            >
              {SCAM_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All Types" : s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>DATE FROM</div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setFrom(e.target.value)}
              style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}
            />
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>DATE TO</div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setTo(e.target.value)}
              style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            style={{
              padding: "10px 22px",
              borderRadius: "10px",
              fontSize: "13px",
              fontWeight: 600,
              background: loading ? "#2a2a3a" : A,
              color: loading ? "#6b7280" : "#fff",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = A_HOVER; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = A; }}
          >
            {loading && (
              <span style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite",
                display: "inline-block",
              }} />
            )}
            {loading ? "Generating…" : "Generate Report"}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleExportCSV}
            disabled={loading || rows.length === 0}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              background: "#111120",
              border: "1px solid #1a1a2a",
              color: rows.length ? "#9ca3af" : "#374151",
              cursor: rows.length ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            CSV
          </button>

          <button
            onClick={handleExportPDF}
            disabled={loading || rows.length === 0}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 500,
              background: "#111120",
              border: "1px solid #1a1a2a",
              color: rows.length ? "#9ca3af" : "#374151",
              cursor: rows.length ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* ─── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: "10px 14px",
          borderRadius: "8px",
          background: "#1a0606",
          border: "1px solid #ef444440",
          color: "#ef4444",
          fontSize: "12px",
        }}>
          {error}
        </div>
      )}

      {/* ─── Success toast ────────────────────────────────────────── */}
      {showSuccess && (
        <div style={{
          padding: "12px 16px",
          borderRadius: "10px",
          fontSize: "13px",
          fontWeight: 500,
          background: A_TINT,
          border: `1px solid ${A_TINT_BORDER}`,
          color: A,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Action completed successfully.
        </div>
      )}

      {/* ─── KPI cards (when data exists) ─────────────────────────── */}
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>TOTAL REPORTS</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>
              {totalReports.toLocaleString()}
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              Across {rows.length} region{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>HIGHEST ACTIVITY</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: A, fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px", wordBreak: "break-word" }}>
              {topRegion?.region || "—"}
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              {(topRegion?.reports || 0).toLocaleString()} report{(topRegion?.reports || 0) === 1 ? "" : "s"} · top: {topRegion?.topScamType || "UNKNOWN"}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>AVG PER REGION</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>
              {avgPerRegion.toLocaleString()}
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>Mean report volume</div>
          </div>
        </div>
      )}

      {/* ─── Data table ──────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Data Preview</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              {loading ? "Loading…" : `${rows.length} region${rows.length === 1 ? "" : "s"} · agency scope`}
            </div>
          </div>
          {rows.length > 0 && (
            <span style={{
              fontSize: "10px",
              color: "#64748b",
              fontFamily: "'JetBrains Mono',monospace",
              padding: "4px 10px",
              borderRadius: "999px",
              background: "#080810",
              border: "1px solid #13131e",
            }}>
              {totalReports.toLocaleString()} total
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
            <div style={{
              width: "18px",
              height: "18px",
              borderRadius: "50%",
              border: "2px solid rgba(168,85,247,0.3)",
              borderTopColor: A,
              animation: "spin 0.7s linear infinite",
              display: "inline-block",
              marginBottom: "10px",
            }} />
            <div>Loading reports…</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            padding: "48px 20px",
            textAlign: "center",
            color: "#4b5563",
            fontSize: "12px",
            borderRadius: "10px",
            background: "#080810",
            border: "1px solid #13131e",
          }}>
            <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500, marginBottom: "4px" }}>
              No reports match the current filters.
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              Adjust the filters above, then click <strong style={{ color: A }}>Generate Report</strong>.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "640px" }}>
              <thead>
                <tr>
                  {["REGION", "TOTAL REPORTS", "SHARE", "TOP SCAM TYPE", "LATEST REPORT"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        ...thS,
                        textAlign: i === 1 || i === 2 ? "right" : "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const share = totalReports > 0 ? (r.reports || 0) / totalReports : 0;
                  return (
                    <tr
                      key={r.region}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#101020"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      style={{ transition: "background 0.12s ease" }}
                    >
                      <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{r.region}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}>
                        {(r.reports || 0).toLocaleString()}
                      </td>
                      <td style={{ ...tdS, textAlign: "right", minWidth: "120px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                          <div style={{
                            width: "60px",
                            height: "4px",
                            borderRadius: "999px",
                            background: "#13131e",
                            overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%",
                              width: `${Math.max(4, share * 100)}%`,
                              background: A,
                              borderRadius: "999px",
                              transition: "width 0.3s ease",
                            }} />
                          </div>
                          <span style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            fontFamily: "'JetBrains Mono',monospace",
                            minWidth: "38px",
                            textAlign: "right",
                          }}>
                            {(share * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td style={{ ...tdS, color: A, fontWeight: 500 }}>{r.topScamType || "UNKNOWN"}</td>
                      <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>
                        {r.latestReportAt
                          ? new Date(r.latestReportAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}