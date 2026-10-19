// apps/web/src/pages/Admin-Tabs/RegionalReports.jsx
import { useEffect, useState, useCallback, useMemo } from "react";
import apiClient from "../../lib/api";

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

// FIXED: Replaced hardcoded categories with the actual AI subtypes
// mapped to human-readable labels for the dropdown.
const SCAM_TYPE_OPTIONS = [
  { value: "all", label: "All Subtypes" },
  { value: "phishing_link", label: "Phishing Link (Smishing)" },
  { value: "fake_prize_lottery", label: "Fake Prize / Lottery" },
  { value: "wrong_number_baiting", label: "Wrong-Number Baiting" },
  { value: "urgent_fine_toll", label: "Urgent Fine / Toll" },
  { value: "impersonation_family", label: "Impersonation (Family)" },
  { value: "brand_marketing", label: "Brand Marketing" },
  { value: "personal_conversational", label: "Personal Conversation" },
  { value: "two_factor_auth", label: "One-Time Password (OTP)" },
  { value: "appointment_reminder", label: "Appointment Reminder" },
  { value: "delivery_tracking", label: "Delivery Tracking" },
  { value: "bank_activity_alert", label: "Bank Activity Alert" },
  { value: "UNLABELED", label: "Unlabeled / Unknown" },
];

const STATUS_OPTIONS = [
  "all", "pending", "under_review", "one_approval", "two_approvals",
  "blacklisted", "approved", "rejected",
];

function reportFilename(ext) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `SentinelPH_RegionalReport_${y}${m}${d}_${hh}${mm}.${ext}`;
}

function filterSummary({ region, scamType, status, dateFrom, dateTo }) {
  // Find the human-readable label for the scamType
  const scamTypeLabel = SCAM_TYPE_OPTIONS.find(s => s.value === scamType)?.label || "All Types";
  
  return {
    Region: region === "all" ? "All Regions" : region,
    "Scam Subtype": scamType === "all" ? "All Types" : scamTypeLabel,
    Status: status === "all" ? "All Statuses" : status,
    "Date From": dateFrom || "—",
    "Date To": dateTo || "—",
  };
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}
function csvRow(cells) {
  return cells.map(csvCell).join(",");
}
function downloadBlob(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function fmtDateTime(v) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("en-PH", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(v); }
}

function truncate(s, n) {
  const str = String(s ?? "");
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

export default function RegionalReports() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // "csv" | "pdf" | null
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [detailRows, setDetailRows] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(null);

  const [region, setRegion] = useState("all");
  const [scamType, setScamType] = useState("all");
  const [status, setStatus] = useState("all");
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

  const buildParams = useCallback(() => {
    const params = {};
    if (region !== "all") params.region = region;
    if (scamType !== "all") params.scamType = scamType;
    if (dateFrom) params.from = dateFrom;
    if (dateTo) params.to = dateTo;
    return params;
  }, [region, scamType, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get("/api/v1/admin/reports", {
        params: buildParams(),
      });
      setRows(res.data || []);
      setLastGeneratedAt(new Date());
    } catch (err) {
      setError(err?.response?.data?.message || "Could not generate the regional report.");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function triggerSuccess() {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  function handleGenerateReport() {
    load();
    triggerSuccess();
  }

  async function fetchDetailRows() {
    const params = { ...buildParams(), limit: 1000 };
    if (status !== "all") params.status = status;
    const { data: res } = await apiClient.get("/api/v1/admin/reports/export", { params });
    const data = res.data || [];
    setDetailRows(data);
    return { data, meta: res.meta || {} };
  }

  async function handleExportCSV() {
    setError(null);
    setExporting("csv");
    try {
      const { data, meta } = await fetchDetailRows();
      if (data.length === 0) {
        setError("No reports match the current filters.");
        return;
      }

      const filters = filterSummary({ region, scamType, status, dateFrom, dateTo });
      const lines = [];

      lines.push(csvRow(["SentinelPH — Report Export"]));
      lines.push(csvRow([`Generated: ${meta.generatedAt || new Date().toISOString()}`]));
      lines.push(csvRow([`Agency: ${meta.agency || "—"}`]));
      lines.push(csvRow([`Jurisdiction: ${meta.jurisdiction || "—"}`]));
      lines.push(csvRow([`Rows: ${data.length}`]));
      lines.push("");

      lines.push(csvRow(["Filters Applied"]));
      for (const [k, v] of Object.entries(filters)) {
        lines.push(csvRow([k, v]));
      }
      lines.push("");

      // Status summary
      const byStatus = {};
      const byAiLabel = {};
      const byVerdict = {};
      for (const r of data) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byAiLabel[r.aiLabel] = (byAiLabel[r.aiLabel] || 0) + 1;
        const v = r.officerVerdict || "(unreviewed)";
        byVerdict[v] = (byVerdict[v] || 0) + 1;
      }
      lines.push(csvRow(["Status Counts"]));
      for (const [k, v] of Object.entries(byStatus)) lines.push(csvRow([k, v]));
      lines.push("");
      lines.push(csvRow(["AI Label Counts"]));
      for (const [k, v] of Object.entries(byAiLabel)) lines.push(csvRow([k, v]));
      lines.push("");
      lines.push(csvRow(["Officer Verdict Counts"]));
      for (const [k, v] of Object.entries(byVerdict)) lines.push(csvRow([k, v]));
      lines.push("");

      const HEADERS = [
        "Report ID",
        "Sequence",
        "Filed At",
        "Status",
        "Resolved At",
        "Region",
        "Address",
        "Channel",
        "Reported Number",
        "Reporter Name",
        "Reporter Email",
        "Reporter Shared",
        "Text Data",
        "Category Declared",
        "Scam Type Declared",
        "AI Label",
        "AI Subtype",
        "AI Confidence",
        "AI Subtype Confidence",
        "AI Risk Level",
        "AI Model Version",
        "AI OCR Used",
        "Officer Verdict",
        "Officer Agreement",
        "Officer Finalized At",
        "Vote Count",
        "Votes (officer / decision / subtype action / comment / voted at)",
        "Vote Details",
        "Hash",
      ];

      lines.push(csvRow(HEADERS));

      for (const r of data) {
        const votesCompact = (r.votes || [])
          .map((v) => `${v.officerName || v.userId} | ${v.decision}${v.subtypeAction ? " / " + v.subtypeAction : ""}${v.correctedSubtype ? " → " + v.correctedSubtype : ""}`)
          .join(" ; ");
        const voteDetails = (r.votes || [])
          .map((v) => {
            const when = fmtDateTime(v.votedAt);
            const edited = v.editedAt ? ` (edited ${fmtDateTime(v.editedAt)})` : "";
            const cmt = v.comment ? ` — "${truncate(v.comment, 240)}"` : "";
            const act = v.subtypeAction
              ? ` [${v.subtypeAction}${v.correctedSubtype ? ` → ${v.correctedSubtype}` : ""}]`
              : "";
            return `${v.officerName || v.userId}: ${v.decision}${act} @ ${when}${edited}${cmt}`;
          })
          .join(" || ");

        lines.push(csvRow([
          r.reportId,
          r.sequence,
          fmtDateTime(r.createdAt),
          r.status,
          fmtDateTime(r.resolvedAt),
          r.region,
          r.address || "",
          r.channel,
          r.reportedNumber,
          r.reporterName || "",
          r.reporterEmail || "",
          r.reporterShared ? "Yes" : "No",
          truncate(r.textData, 500),
          r.category,
          r.scamType,
          r.aiLabel,
          r.aiSubtype || "",
          r.aiConfidence != null ? Number(r.aiConfidence).toFixed(4) : "",
          r.aiSubtypeConfidence != null ? Number(r.aiSubtypeConfidence).toFixed(4) : "",
          r.aiRiskLevel,
          r.aiModelVersion || "",
          r.aiOcrUsed ? "Yes" : "No",
          r.officerVerdict || "",
          r.officerAgreement || 0,
          fmtDateTime(r.officerFinalizedAt),
          (r.votes || []).length,
          votesCompact,
          voteDetails,
          r.hash || "",
        ]));
      }

      const csv = lines.join("\r\n");
      downloadBlob("\uFEFF" + csv, "text/csv;charset=utf-8;", reportFilename("csv"));
      triggerSuccess();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not export CSV.");
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPDF() {
    setError(null);
    setExporting("pdf");
    try {
      const { data, meta } = await fetchDetailRows();
      if (data.length === 0) {
        setError("No reports match the current filters.");
        return;
      }

      const escapeHtml = (value) =>
        String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      const filters = filterSummary({ region, scamType, status, dateFrom, dateTo });
      const generatedAt = new Date();

      // Status summary
      const byStatus = {};
      const byAiLabel = {};
      const byVerdict = {};
      for (const r of data) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byAiLabel[r.aiLabel] = (byAiLabel[r.aiLabel] || 0) + 1;
        const v = r.officerVerdict || "(unreviewed)";
        byVerdict[v] = (byVerdict[v] || 0) + 1;
      }
      const summaryRowsHtml = (obj) =>
        Object.entries(obj)
          .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td class="num">${v}</td></tr>`)
          .join("");

      const filterRowsHtml = Object.entries(filters)
        .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
        .join("");

      const detailRowsHtml = data.map((r) => {
        const votesHtml = (r.votes || [])
          .map((v) => {
            const name = v.officerName || v.userId;
            const badge = v.officerBadgeId ? ` (${v.officerBadgeId})` : "";
            const act = v.subtypeAction
              ? `<span class="tag">${escapeHtml(v.subtypeAction)}${v.correctedSubtype ? ` → ${escapeHtml(v.correctedSubtype)}` : ""}</span>`
              : "";
            const cmt = v.comment ? `<div class="cmt">"${escapeHtml(truncate(v.comment, 300))}"</div>` : "";
            return `<div class="vote"><strong>${escapeHtml(name)}</strong>${escapeHtml(badge)} — <span class="dec ${v.decision}">${escapeHtml(v.decision)}</span> ${act}<span class="when">${escapeHtml(fmtDateTime(v.votedAt))}</span>${cmt}</div>`;
          })
          .join("");

        return `
          <tr>
            <td class="mono">${escapeHtml(r.reportId)}</td>
            <td>${escapeHtml(r.region)}</td>
            <td class="mono">${escapeHtml(r.reportedNumber)}</td>
            <td><span class="tag">${escapeHtml(r.status)}</span></td>
            <td><span class="tag ai">${escapeHtml(r.aiLabel)}</span>${r.aiSubtype ? `<div class="sub">${escapeHtml(r.aiSubtype)}</div>` : ""}${r.aiConfidence != null ? `<div class="sub">conf ${Number(r.aiConfidence).toFixed(2)}</div>` : ""}</td>
            <td><span class="tag verdict">${escapeHtml(r.officerVerdict || "—")}</span>${r.officerAgreement ? `<div class="sub">agreement ${r.officerAgreement}/3</div>` : ""}</td>
            <td class="txt">${escapeHtml(truncate(r.textData, 400))}</td>
            <td class="votes">${votesHtml || '<span class="muted">no votes yet</span>'}</td>
            <td class="mono small">${escapeHtml(fmtDateTime(r.createdAt))}</td>
          </tr>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SentinelPH Regional Report — ${escapeHtml(reportFilename("pdf"))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    color: #111827;
    margin: 0;
    font-size: 10px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #6d28d9;
    padding-bottom: 10px; margin-bottom: 14px;
  }
  .header h1 { font-size: 18px; font-weight: 800; margin: 0 0 4px 0; color: #4c1d95; letter-spacing: -0.01em; }
  .header .subtitle { font-size: 11px; color: #6b7280; }
  .header .meta { text-align: right; font-size: 10px; color: #6b7280; line-height: 1.5; }
  .header .meta strong { color: #111827; }
  h2 {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #6d28d9; margin: 16px 0 8px 0;
    page-break-after: avoid;
  }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  thead th {
    background: #f5f3ff; color: #4c1d95; font-weight: 700;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
    border-bottom: 2px solid #6d28d9;
  }
  tbody tr:nth-child(even) td { background: #fafafa; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  table.filters { width: auto; margin-bottom: 6px; }
  table.filters th { text-align: left; background: transparent; color: #6b7280; font-weight: 600; text-transform: none; letter-spacing: 0; font-size: 10px; padding: 2px 12px 2px 0; border: none; }
  table.filters td { padding: 2px 0; font-weight: 600; color: #111827; border: none; font-size: 10px; }
  table.summary th { text-align: left; background: transparent; color: #6b7280; font-weight: 600; text-transform: none; letter-spacing: 0; font-size: 10px; padding: 2px 12px 2px 0; border: none; }
  table.summary td { padding: 2px 0; font-weight: 700; color: #111827; border: none; font-size: 10px; }
  .mono { font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace; }
  .small { font-size: 9px; color: #6b7280; }
  .txt { max-width: 220px; word-break: break-word; }
  .votes { max-width: 260px; }
  .vote { padding: 3px 0; border-bottom: 1px dashed #e5e7eb; font-size: 9px; line-height: 1.4; }
  .vote:last-child { border-bottom: none; }
  .dec.approve { color: #047857; font-weight: 700; }
  .dec.reject { color: #b91c1c; font-weight: 700; }
  .when { color: #6b7280; margin-left: 6px; }
  .cmt { color: #374151; font-style: italic; margin-top: 2px; }
  .tag {
    display: inline-block; padding: 1px 6px; border-radius: 999px;
    background: #eef2ff; color: #3730a3; font-weight: 600; font-size: 9px;
    border: 1px solid #c7d2fe;
  }
  .tag.ai { background: #ecfeff; color: #0e7490; border-color: #a5f3fc; }
  .tag.verdict { background: #ecfdf5; color: #065f46; border-color: #a7f3d0; }
  .sub { font-size: 8px; color: #6b7280; margin-top: 2px; }
  .muted { color: #9ca3af; font-style: italic; }
  tr.total td {
    border-top: 2px solid #6d28d9; border-bottom: none;
    font-weight: 800; background: #f5f3ff !important; color: #4c1d95;
  }
  .footer {
    margin-top: 18px; padding-top: 10px; border-top: 1px solid #e5e7eb;
    font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.6;
  }
  tr, .vote { page-break-inside: avoid; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>SentinelPH — Regional Reports</h1>
      <div class="subtitle">Full report-level export with officer review trail</div>
    </div>
    <div class="meta">
      <div><strong>Generated:</strong> ${escapeHtml(generatedAt.toLocaleString("en-PH", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      }))}</div>
      <div><strong>Agency:</strong> ${escapeHtml(meta.agency || "—")}</div>
      <div><strong>Jurisdiction:</strong> ${escapeHtml(meta.jurisdiction || "—")}</div>
      <div><strong>Rows in export:</strong> ${data.length}</div>
    </div>
  </div>

  <h2>Filters Applied</h2>
  <table class="filters"><tbody>${filterRowsHtml}</tbody></table>

  <h2>Summary</h2>
  <div class="grid3">
    <table class="summary"><tbody>${summaryRowsHtml(byStatus)}</tbody></table>
    <table class="summary"><tbody>${summaryRowsHtml(byAiLabel)}</tbody></table>
    <table class="summary"><tbody>${summaryRowsHtml(byVerdict)}</tbody></table>
  </div>

  <h2>Report Detail</h2>
  <table>
    <thead>
      <tr>
        <th>Report ID</th>
        <th>Region</th>
        <th>Reported Number</th>
        <th>Status</th>
        <th>AI Classification</th>
        <th>Officer Verdict</th>
        <th>Message</th>
        <th>Votes &amp; Comments</th>
        <th>Filed At</th>
      </tr>
    </thead>
    <tbody>${detailRowsHtml}</tbody>
  </table>

  <div class="footer">
    SentinelPH · Protected under RA 10175 · Philippine Cybercrime Prevention Act<br />
    This report is auto-generated from the SentinelPH admin console. Unauthorized distribution is prohibited.
  </div>

  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 200); };
  </script>
</body>
</html>`;

      const w = window.open("", "_blank", "width=1200,height=850");
      if (!w) {
        setError("Popup blocked. Allow popups for this site to export the PDF.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      triggerSuccess();
    } catch (err) {
      setError(err?.response?.data?.message || "Could not export PDF.");
    } finally {
      setExporting(null);
    }
  }

  function clearFilters() {
    setRegion("all");
    setScamType("all");
    setStatus("all");
    setFrom("");
    setTo("");
  }

  const totalReports = useMemo(
    () => rows.reduce((sum, r) => sum + (r.reports || 0), 0),
    [rows]
  );
  const topRegion = rows[0];
  const avgPerRegion = rows.length > 0 ? Math.round(totalReports / rows.length) : 0;
  const activeFilterCount = [
    region !== "all",
    scamType !== "all",
    status !== "all",
    Boolean(dateFrom),
    Boolean(dateTo),
  ].filter(Boolean).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

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
          <span style={{ color: A, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", letterSpacing: "0.08em" }}>
            ANALYTICS
          </span>
          <span style={{ color: "#374151" }}>·</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            Full report-level export with officer review trail
          </span>
        </div>
        {lastGeneratedAt && (
          <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
            Last generated {lastGeneratedAt.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
        )}
      </div>

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
              style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "11px", fontWeight: 500, color: "#9ca3af", background: "transparent", border: "1px solid #1a1a2a", cursor: "pointer" }}
            >
              Clear filters
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>REGION</div>
            <select value={region} onChange={(e) => setRegion(e.target.value)} style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}>
              {REGION_OPTIONS.map((r) => <option key={r} value={r}>{r === "all" ? "All Regions" : r}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>SCAM SUBTYPE</div>
            <select value={scamType} onChange={(e) => setScamType(e.target.value)} style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}>
              {SCAM_TYPE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>STATUS (EXPORT)</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "all" ? "All Statuses" : s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>DATE FROM</div>
            <input type="date" value={dateFrom} onChange={(e) => setFrom(e.target.value)} style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"} />
          </div>
          <div>
            <div style={{ fontSize: "9px", marginBottom: "6px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", fontWeight: 600 }}>DATE TO</div>
            <input type="date" value={dateTo} onChange={(e) => setTo(e.target.value)} style={inputS}
              onFocus={(e) => e.currentTarget.style.borderColor = A}
              onBlur={(e) => e.currentTarget.style.borderColor = "#1a1a2a"} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            style={{
              padding: "10px 22px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
              background: loading ? "#2a2a3a" : A, color: loading ? "#6b7280" : "#fff",
              border: "none", cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "8px",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = A_HOVER; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = A; }}
          >
            {loading && (
              <span style={{
                width: "12px", height: "12px", borderRadius: "50%",
                border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff",
                animation: "spin 0.7s linear infinite", display: "inline-block",
              }} />
            )}
            {loading ? "Generating…" : "Generate Report"}
          </button>

          <div style={{ flex: 1 }} />

          <button
            onClick={handleExportCSV}
            disabled={!!exporting}
            style={{
              padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500,
              background: "#111120", border: "1px solid #1a1a2a",
              color: exporting === "csv" ? "#6b7280" : "#9ca3af",
              cursor: exporting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {exporting === "csv" && (
              <span style={{
                width: "10px", height: "10px", borderRadius: "50%",
                border: "2px solid rgba(168,85,247,0.3)", borderTopColor: A,
                animation: "spin 0.7s linear infinite", display: "inline-block",
              }} />
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting === "csv" ? "Exporting…" : "CSV"}
          </button>

          <button
            onClick={handleExportPDF}
            disabled={!!exporting}
            style={{
              padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500,
              background: "#111120", border: "1px solid #1a1a2a",
              color: exporting === "pdf" ? "#6b7280" : "#9ca3af",
              cursor: exporting ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {exporting === "pdf" && (
              <span style={{
                width: "10px", height: "10px", borderRadius: "50%",
                border: "2px solid rgba(168,85,247,0.3)", borderTopColor: A,
                animation: "spin 0.7s linear infinite", display: "inline-block",
              }} />
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            {exporting === "pdf" ? "Exporting…" : "PDF"}
          </button>
        </div>

        <div style={{ marginTop: "10px", fontSize: "10px", color: "#4b5563" }}>
          CSV and PDF export fetch up to <strong style={{ color: "#9ca3af" }}>1,000</strong> individual reports from{" "}
          <code style={{ color: "#9ca3af" }}>/api/v1/admin/reports/export</code> with the current filters applied.
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: A_TINT, border: `1px solid ${A_TINT_BORDER}`, color: A, display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Action completed successfully.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>TOTAL REPORTS</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{totalReports.toLocaleString()}</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>Across {rows.length} region{rows.length === 1 ? "" : "s"}</div>
          </div>
          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>HIGHEST ACTIVITY</div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: A, fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px", wordBreak: "break-word" }}>{topRegion?.region || "—"}</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              {(topRegion?.reports || 0).toLocaleString()} report{(topRegion?.reports || 0) === 1 ? "" : "s"} · top: {topRegion?.topScamType || "UNKNOWN"}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em", marginBottom: "8px" }}>AVG PER REGION</div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{avgPerRegion.toLocaleString()}</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>Mean report volume</div>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Data Preview</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>
              {loading ? "Loading…" : `${rows.length} region${rows.length === 1 ? "" : "s"} · agency scope`}
            </div>
          </div>
          {rows.length > 0 && (
            <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "'JetBrains Mono',monospace", padding: "4px 10px", borderRadius: "999px", background: "#080810", border: "1px solid #13131e" }}>
              {totalReports.toLocaleString()} total
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
            <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid rgba(168,85,247,0.3)", borderTopColor: A, animation: "spin 0.7s linear infinite", display: "inline-block", marginBottom: "10px" }} />
            <div>Loading reports…</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "#4b5563", fontSize: "12px", borderRadius: "10px", background: "#080810", border: "1px solid #13131e" }}>
            <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500, marginBottom: "4px" }}>No reports match the current filters.</div>
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
                    <th key={h} style={{ ...thS, textAlign: i === 1 || i === 2 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const share = totalReports > 0 ? (r.reports || 0) / totalReports : 0;
                  return (
                    <tr key={r.region}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#101020"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      style={{ transition: "background 0.12s ease" }}>
                      <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{r.region}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}>{(r.reports || 0).toLocaleString()}</td>
                      <td style={{ ...tdS, textAlign: "right", minWidth: "120px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px" }}>
                          <div style={{ width: "60px", height: "4px", borderRadius: "999px", background: "#13131e", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.max(4, share * 100)}%`, background: A, borderRadius: "999px", transition: "width 0.3s ease" }} />
                          </div>
                          <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace", minWidth: "38px", textAlign: "right" }}>
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