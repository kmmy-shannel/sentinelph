// src/pages/Analyst-Tabs/RegionalReports.jsx
import { useState } from "react";

const PREVIEW = [
  { region: "NCR",          reports: 12841, scamType: "OTP Phishing",       topNumber: "+63 917 823 4411", change: "+14.2%" },
  { region: "Region III",   reports: 4218,  scamType: "Bank Impersonation", topNumber: "+63 933 112 8890", change: "+9.1%"  },
  { region: "Region IV-A",  reports: 3984,  scamType: "Investment Scam",    topNumber: "+63 948 667 2201", change: "+21.4%" },
  { region: "Region VII",   reports: 2201,  scamType: "Parcel/Delivery",    topNumber: "+63 956 774 3390", change: "+6.8%"  },
  { region: "Region XI",    reports: 1840,  scamType: "Gov't Impersonation",topNumber: "+63 961 887 3384", change: "+11.2%" },
];

const SCHEDULED = [
  { name: "Weekly NCR Summary",     freq: "Every Monday 08:00",  next: "Sep 2, 2026",  format: "PDF" },
  { name: "Monthly National Report",freq: "1st of month 09:00",  next: "Sep 1, 2026",  format: "PDF + CSV" },
  { name: "Flagged Numbers Export", freq: "Every Friday 17:00",  next: "Aug 30, 2026", format: "CSV" },
];

export default function RegionalReports() {
  const [region, setRegion]   = useState("all");
  const [dateFrom, setFrom]   = useState("2026-08-01");
  const [dateTo, setTo]       = useState("2026-08-28");
  const [scamType, setScamType] = useState("all");

  const inputS = { padding: "8px 12px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" };
  const card   = { borderRadius: "12px", padding: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const thS    = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
  const tdS    = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Filters */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Report Filters</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>REGION</div>
            <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ ...inputS, width: "100%" }}>
              <option value="all">All Regions</option>
              <option value="ncr">NCR</option>
              <option value="r3">Region III</option>
              <option value="r4a">Region IV-A</option>
              <option value="r7">Region VII</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: "10px", marginBottom: "6px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>SCAM TYPE</div>
            <select value={scamType} onChange={(e) => setScamType(e.target.value)} style={{ ...inputS, width: "100%" }}>
              <option value="all">All Types</option>
              <option value="otp">OTP Phishing</option>
              <option value="bank">Bank Impersonation</option>
              <option value="invest">Investment Scam</option>
              <option value="parcel">Parcel/Delivery</option>
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
          <button style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#a855f7", color: "#fff", border: "none", cursor: "pointer" }}>Generate Report</button>
          <button style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>Export CSV</button>
          <button style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "12px", fontWeight: 500, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>Export PDF</button>
        </div>
      </div>

      {/* Data preview */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Data Preview — All Regions, Aug 2026</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Showing top regions by report volume</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["REGION","TOTAL REPORTS","TOP SCAM TYPE","HIGHEST REPORTED NUMBER","WOW CHANGE"].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {PREVIEW.map((r) => (
              <tr key={r.region}>
                <td style={{ ...tdS, fontWeight: 600, color: "#fff" }}>{r.region}</td>
                <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{r.reports.toLocaleString()}</td>
                <td style={{ ...tdS, color: "#a855f7" }}>{r.scamType}</td>
                <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{r.topNumber}</td>
                <td style={{ ...tdS, fontWeight: 600, color: "#ef4444", fontFamily: "'JetBrains Mono',monospace" }}>{r.change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scheduled reports */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Scheduled Reports</div>
        {SCHEDULED.map((s) => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #13131e" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: "#fff" }}>{s.name}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>{s.freq}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>Next: {s.next}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#a855f7" }}>{s.format}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}