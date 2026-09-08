// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
import { useState } from "react";

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
    <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const REGISTRY = [
  { id: "BLK-00341", number: "+63 998 011 2233", type: "Bank Impersonation",   reports: 132, status: "Blocked",  officers: "Cruz, R. · Dela Torre, M.", date: "Aug 28 08:52" },
  { id: "BLK-00340", number: "+63 905 338 8810", type: "Parcel/Delivery",      reports: 89,  status: "Blocked",  officers: "Cruz, R. · Bautista, L.",   date: "Aug 27 22:45" },
  { id: "BLK-00339", number: "+63 943 112 5560", type: "Gov't Impersonation",  reports: 61,  status: "Blocked",  officers: "Dela Torre, M. · Santos, P.",date: "Aug 27 21:18" },
  { id: "BLK-00338", number: "+63 912 778 4430", type: "OTP Phishing",         reports: 33,  status: "Rejected", officers: "Cruz, R.",                   date: "Aug 27 18:22" },
  { id: "BLK-00337", number: "+63 961 887 3394", type: "Bank Impersonation",   reports: 74,  status: "Blocked",  officers: "Cruz, R. · Bautista, L.",   date: "Aug 27 15:00" },
  { id: "BLK-00336", number: "+63 921 554 2290", type: "Investment Scam",      reports: 47,  status: "Blocked",  officers: "Dela Torre, M.",            date: "Aug 27 12:33" },
  { id: "BLK-00335", number: "+63 933 441 8881", type: "Investment Scam",      reports: 91,  status: "Blocked",  officers: "Cruz, R. · Santos, P.",     date: "Aug 26 20:10" },
  { id: "BLK-00334", number: "+63 908 112 5540", type: "Parcel/Delivery",      reports: 28,  status: "Rejected", officers: "Bautista, L.",              date: "Aug 26 17:44" },
];

export default function BlacklistRegistry() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = REGISTRY.filter((e) => {
    const matchFilter = filter === "all" || e.status.toLowerCase() === filter;
    const matchSearch = !search || e.number.includes(search) || e.type.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

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
        <button style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#6b7280" }}>
          Export CSV
        </button>
      </div>

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Blacklist Registry</div>
            <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>{filtered.length} entries</div>
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
            {filtered.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #13131e", cursor: "pointer" }}
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
    </div>
  );
}