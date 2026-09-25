// apps/web/src/pages/Analyst-Tabs/AnalystDashboard.jsx
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const patterns = [
  { n: 1, pattern: "Fake OTP verification request",   category: "OTP Phishing",       reports: 4281, wow: "+22%" },
  { n: 2, pattern: "Bank account suspension threat",   category: "Bank Impersonation",  reports: 3147, wow: "+8%"  },
  { n: 3, pattern: "Parcel customs clearance fee",     category: "Parcel/Delivery",     reports: 2380, wow: "+31%" },
  { n: 4, pattern: "30%+ monthly investment returns",  category: "Investment Scam",     reports: 1540, wow: "+4%"  },
  { n: 5, pattern: "PhilSys ID verification link",    category: "Gov't Impersonation", reports: 1180, wow: "+18%" },
];
const flagged = [
  { id: "FL-04411", number: "+63 921 334 5510", label: "OTP Phishing",       conf: "94.2%", confC: "#22c55e", status: "Pending"  },
  { id: "FL-04408", number: "+63 908 771 2230", label: "Bank Impersonation",  conf: "79.1%", confC: "#f59e0b", status: "Approved" },
  { id: "FL-04401", number: "+63 933 445 8810", label: "Investment Scam",     conf: "68.4%", confC: "#ef4444", status: "Pending"  },
  { id: "FL-04397", number: "+63 917 882 1104", label: "Parcel/Delivery",     conf: "91.8%", confC: "#22c55e", status: "Approved" },
];

//  SINGLE combined array (This fixes the double dates!)
const trendData = [
  { day: "Aug 22", sms: 90, calls: 60 },
  { day: "Aug 23", sms: 100, calls: 75 },
  { day: "Aug 24", sms: 110, calls: 90 },
  { day: "Aug 25", sms: 120, calls: 100 },
  { day: "Aug 26", sms: 135, calls: 120 },
  { day: "Aug 27", sms: 150, calls: 145 },
  { day: "Aug 28", sms: 180, calls: 180 },
];

const heatmapData = [
  { region: "Quezon City", v: 980 }, { region: "Makati", v: 720 },
  { region: "Pasig", v: 560 }, { region: "Parañaque", v: 410 },
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function AnalystDashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {[
          { l: "TOTAL REPORTS (AUG)",  v: "12,841", sc: "#22c55e", sub: "+14.2% WoW  +31.6% MoM" },
          { l: "AI MODEL ACCURACY",    v: "87.4%",  sc: "#22c55e", sub: "↑ Above 85% target · rolling 7-day" },
          { l: "FLAGGED FOR REVIEW",   v: "214",    sc: "#f59e0b", sub: "AI-flagged · awaiting classification" },
          { l: "SCAM TYPES TRACKED",   v: "7",      sc: "#a855f7", sub: "Active clusters · all channels" },
        ].map(s => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.07em" }}>{s.l}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
            <div style={{ fontSize: "11px", color: s.sc }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row (This is the fixed graph!) */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>7-Day Report Trend</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Daily incoming reports, your jurisdiction</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="smsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              
              {/* SMS (Blue) */}
              <Area type="monotone" dataKey="sms" stroke="#3b82f6" strokeWidth={2} fill="url(#smsGrad)" />
              
              {/* Calls (Purple) */}
              <Area type="monotone" dataKey="calls" stroke="#a855f7" strokeWidth={2} fill="url(#callGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Regional Heatmap</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Cumulative reports, Aug 2026</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={heatmapData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {heatmapData.map((_, i) => <Cell key={i} fill={`rgba(168,85,247,${0.9 - i * 0.15})`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Patterns + AI Accuracy */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Top Scam Patterns</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Ranked by report frequency, Aug 2026</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["#","PATTERN","CATEGORY","REPORTS","WOW"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {patterns.map(p => (
                <tr key={p.n}>
                  <td style={{ ...tdS, color: "#374151" }}>{p.n}</td>
                  <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{p.pattern}</td>
                  <td style={{ ...tdS, color: "#a855f7" }}>{p.category}</td>
                  <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{p.reports.toLocaleString()}</td>
                  <td style={{ ...tdS, fontWeight: 600, color: p.wow.startsWith("+") ? "#ef4444" : "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>{p.wow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>AI Detector Accuracy</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Target: ≥85% · Rolling 7-day</div>
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "40px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>87.4%</div>
            <span style={{ display: "inline-block", marginTop: "8px", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#14412a", color: "#22c55e" }}>● ON TARGET</span>
          </div>
          {[{ l: "Precision", v: "88.2%", c: "#3b82f6" }, { l: "Recall", v: "86.5%", c: "#22c55e" }, { l: "F1 Score", v: "87.3%", c: "#f59e0b" }].map(m => (
            <div key={m.l} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
              <span style={{ color: "#6b7280" }}>{m.l}</span>
              <span style={{ fontWeight: 600, color: m.c, fontFamily: "'JetBrains Mono',monospace" }}>{m.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged items */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>AI-Flagged — Awaiting Human Classification</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Reports the model could not confidently classify</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["FLAG ID","NUMBER","AI LABEL","CONFIDENCE","STATUS"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {flagged.map(f => (
              <tr key={f.id}>
                <td style={{ ...tdS, color: "#a855f7", fontFamily: "'JetBrains Mono',monospace" }}>{f.id}</td>
                <td style={{ ...tdS, color: "#fff",    fontFamily: "'JetBrains Mono',monospace" }}>{f.number}</td>
                <td style={{ ...tdS, color: "#9ca3af" }}>{f.label}</td>
                <td style={{ ...tdS, fontWeight: 600, color: f.confC, fontFamily: "'JetBrains Mono',monospace" }}>{f.conf}</td>
                <td style={tdS}><span style={{ display: "flex", alignItems: "center", gap: "4px", color: f.status === "Pending" ? "#f59e0b" : "#22c55e" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: f.status === "Pending" ? "#f59e0b" : "#22c55e", display: "inline-block" }} />{f.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}