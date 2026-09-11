// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
import { useState } from "react";

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

const REGISTRY = [
  { id: "BLK-00341", number: "+63 998 011 2233", type: "Bank Impersonation",   reports: 132, status: "Blocked",  officers: "Cruz, R. · Dela Torre, M.", date: "Aug 28 08:52", hash: "0x8f3a2b1c9d4e...f2a1", notes: "Confirmed BDO impersonation via SMS + call. 132 reports in 5 days." },
  { id: "BLK-00340", number: "+63 905 338 8810", type: "Parcel/Delivery",      reports: 89,  status: "Blocked",  officers: "Cruz, R. · Bautista, L.",   date: "Aug 27 22:45", hash: "0x1a9d7e4b2f8c...d0e3", notes: "Fake LBC customs fee scam. Verified by SMS screenshots." },
  { id: "BLK-00339", number: "+63 943 112 5560", type: "Gov't Impersonation",  reports: 61,  status: "Blocked",  officers: "Dela Torre, M. · Santos, P.",date: "Aug 27 21:18", hash: "0x77ba4c1e9a3d...b1c8", notes: "SSS/PhilSys impersonation. Calls to elderly victims." },
  { id: "BLK-00338", number: "+63 912 778 4430", type: "OTP Phishing",         reports: 33,  status: "Rejected", officers: "Cruz, R.",                   date: "Aug 27 18:22", hash: "0x3c55e9b1a2f4...c8a7", notes: "Insufficient evidence — number belongs to a retail store." },
  { id: "BLK-00337", number: "+63 961 887 3394", type: "Bank Impersonation",   reports: 74,  status: "Blocked",  officers: "Cruz, R. · Bautista, L.",   date: "Aug 27 15:00", hash: "0x9e11d3f8b4a2...e5b9", notes: "Confirmed. Full audit trail attached." },
  { id: "BLK-00336", number: "+63 921 554 2290", type: "Investment Scam",      reports: 47,  status: "Blocked",  officers: "Dela Torre, M.",            date: "Aug 27 12:33", hash: "0x22aa8f9c1e7b...a4d6", notes: "Crypto mining pool scam. 47 victims identified." },
  { id: "BLK-00335", number: "+63 933 441 8881", type: "Investment Scam",      reports: 91,  status: "Blocked",  officers: "Cruz, R. · Santos, P.",     date: "Aug 26 20:10", hash: "0x55bc1e9f3a8d...f7c2", notes: "High-volume investment fraud. Multiple bank accounts linked." },
  { id: "BLK-00334", number: "+63 908 112 5540", type: "Parcel/Delivery",      reports: 28,  status: "Rejected", officers: "Bautista, L.",              date: "Aug 26 17:44", hash: "0x77f2a8b4e1c9...d3a5", notes: "Rejected due to insufficient reports." },
];

export default function BlacklistRegistry() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const filtered = REGISTRY.filter((e) => {
    const matchFilter = filter === "all" || e.status.toLowerCase() === filter;
    const matchSearch = !search || e.number.includes(search) || e.type.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
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
          {["all", "blocked", "rejected"].map((f) => (
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

      {showExportSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          CSV exported successfully. Check your downloads folder.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Blacklist Registry</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>{filtered.length} entries · Click any row for details</div>
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
            {filtered.map((row) => (
              <tr key={row.id} 
                onClick={() => setSelectedCase(row)}
                style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Case Detail Modal - Click outside NO LONGER closes it */}
      {selectedCase && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${selectedCase.status === "Blocked" ? "#ef4444" : "#f59e0b"},transparent)` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>{selectedCase.id}</div>
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