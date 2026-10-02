// apps/web/src/pages/Admin-Tabs/RegionalReports.jsx
import { useEffect, useState, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#f97316";

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

  const [region, setRegion] = useState("all");
  const [scamType, setScamType] = useState("all");
  const [dateFrom, setFrom] = useState("");
  const [dateTo, setTo] = useState("");

  const inputS = { padding: "8px 12px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" };
  const card = { borderRadius: "12px", padding: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const thS = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
  const tdS = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

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

  const totalReports = rows.reduce((sum, r) => sum + (r.reports || 0), 0);
  const topRegion = rows[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Filters */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Report Filters</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>REGION</div>
            <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ ...inputS, width: "100%" }}>
              {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r === "all" ? "All Regions" : r}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>SCAM TYPE</div>
            <select value={scamType} onChange={(e) => setScamType(e.target.value)} style={{ ...inputS, width: "100%" }}>
              {SCAM_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All Types" : s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>DATE FROM</div>
            <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)} style={{ ...inputS, width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>DATE TO</div>
            <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)} style={{ ...inputS, width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleGenerateReport} disabled={loading}
            style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: loading ? "#2a2a3a" : A, color: "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer" }}>
            {loading ? "Generating…" : "Generate Report"}
          </button>
          <button onClick={handleExportCSV} disabled={loading || rows.length === 0}
            style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, background: "#111120", border: "1px solid #1a1a2a", color: rows.length ? "#9ca3af" : "#374151", cursor: rows.length ? "pointer" : "not-allowed" }}>
            Export CSV
          </button>
          <button onClick={handleExportPDF} disabled={loading || rows.length === 0}
            style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, background: "#111120", border: "1px solid #1a1a2a", color: rows.length ? "#9ca3af" : "#374151", cursor: rows.length ? "pointer" : "not-allowed" }}>
            Export PDF
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Action completed successfully.
        </div>
      )}

      {/* Summary */}
      {rows.length > 0 && (
        <div style={{ ...card, borderLeft: `4px solid ${A}` }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>Summary</div>
          <div style={{ padding: "16px", borderRadius: "10px", background: "#080810", border: "1px solid #13131e", fontSize: "12px", color: "#9ca3af", lineHeight: 1.7 }}>
            <strong style={{ color: "#fff" }}>{rows.length}</strong> regions analyzed with a combined{" "}
            <strong style={{ color: "#fff" }}>{totalReports.toLocaleString()}</strong> reports.
            {topRegion && (
              <>
                {" "}Highest activity in{" "}
                <span style={{ color: A, fontWeight: 600 }}>{topRegion.region}</span> with{" "}
                {topRegion.reports.toLocaleString()} reports (top type: {topRegion.topScamType || "UNKNOWN"}).
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Data Preview</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>
          {loading ? "Loading…" : `${rows.length} regions · agency scope`}
        </div>
        {loading ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading reports…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
            No reports match the current filters.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["REGION","TOTAL REPORTS","TOP SCAM TYPE","LATEST REPORT"].map((h) => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.region}>
                  <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{r.region}</td>
                  <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{(r.reports || 0).toLocaleString()}</td>
                  <td style={{ ...tdS, color: A }}>{r.topScamType || "UNKNOWN"}</td>
                  <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>
                    {r.latestReportAt ? new Date(r.latestReportAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}