// apps/web/src/pages/Analyst-Tabs/PatternExplorer.jsx
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

const CLUSTERS = [
  { 
    id: "CL-001", 
    name: "OTP Phishing", 
    category: "OTP Phishing", 
    count: 4281, 
    trend: "+22%", 
    color: "#3b82f6",
    sms: 94, call: 6,
    regional: [
      { region: "NCR", v: 1800 },
      { region: "Region IV-A", v: 1250 },
      { region: "Region III", v: 900 },
    ],
    desc: "Fraudsters impersonate banks or e-wallets and request OTP codes under false pretenses (account verification, suspension prevention)."
  },
  { 
    id: "CL-002", 
    name: "Bank Impersonation", 
    category: "Bank Impersonation", 
    count: 3147, 
    trend: "+8%", 
    color: "#ef4444",
    sms: 84, call: 16,
    regional: [
      { region: "NCR", v: 1500 },
      { region: "Region IV-A", v: 1000 },
      { region: "Region III", v: 700 },
    ],
    desc: "Criminals pretend to be bank representatives claiming suspicious activity to trick victims into providing sensitive account details."
  },
  { 
    id: "CL-003", 
    name: "Parcel / Delivery", 
    category: "Parcel/Delivery", 
    count: 2380, 
    trend: "+31%", 
    color: "#f59e0b",
    sms: 80, call: 20,
    regional: [
      { region: "NCR", v: 1200 },
      { region: "Region IV-A", v: 800 },
      { region: "Region III", v: 500 },
    ],
    desc: "Fraudsters impersonate courier companies to trick victims into paying fake customs fees or delivery charges."
  },
  { 
    id: "CL-004", 
    name: "Investment Scam", 
    category: "Investment Scam", 
    count: 1540, 
    trend: "+4%", 
    color: "#22c55e",
    sms: 50, call: 50,
    regional: [
      { region: "NCR", v: 900 },
      { region: "Region IV-A", v: 600 },
      { region: "Region III", v: 300 },
    ],
    desc: "Fraudsters lure victims with promises of high returns on fake investments to steal their money."
  },
];

const scripts = [
  "\"Your GCash OTP is 847291. Do NOT share this with anyone. If you did not request this, call 1800-8-GCASH now.\"",
  "\"BDO Security Alert: Reply your OTP to cancel unauthorized transfer of ₱24,850.\"",
  "\"Maya Wallet: Verify your identity with your 6-digit OTP sent to this number: ____\"",
];

export default function PatternExplorer() {
  const [selected, setSelected] = useState("CL-001");
  const cluster = CLUSTERS.find((c) => c.id === selected);

  const trendData = [
    { day: "Aug 22", v: 320 }, { day: "Aug 23", v: 480 }, { day: "Aug 24", v: 540 },
    { day: "Aug 25", v: 520 }, { day: "Aug 26", v: 600 }, { day: "Aug 27", v: 750 }, { day: "Aug 28", v: 800 },
  ];

  const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };

  // Helper: Safely convert hex color to rgba
  const hexToRgba = (hex, opacity) => {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  return (
    <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 120px)", minHeight: "500px" }}>
      
      {/* Left Cluster List */}
      <div style={{ width: "240px", flexShrink: 0, borderRadius: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>CLUSTERS</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Scam-type clustering and drill-down by category, channel, region</div>
        </div>
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" }}>
          {CLUSTERS.map((c) => {
            const isSelected = selected === c.id;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)}
                style={{ 
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", 
                  padding: "14px 16px", textAlign: "left", cursor: "pointer", 
                  borderRadius: "12px",
                  transition: "all 0.2s ease",
                  background: isSelected ? hexToRgba(c.color, 0.1) : "#0a0a12", 
                  border: isSelected ? `2px solid ${c.color}` : "2px solid #1a1a2a"
                }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{c.name}</div>
                  <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{c.count.toLocaleString()} reports</div>
                </div>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444" }}>{c.trend}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>
        
        {/* Header */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cluster.color, display: "inline-block" }} />
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{cluster.name}</span>
            <span style={{ fontSize: "12px", color: "#4b5563" }}>{cluster.count.toLocaleString()} reports in Aug 2026</span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#ef4444" }}>{cluster.trend} WoW</span>
          </div>
          <p style={{ fontSize: "13px", color: "#9ca3af", marginTop: "8px" }}>
            {cluster.desc}
          </p>
        </div>

        {/* Charts Row */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
          <div style={card}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>7-Day Volume Trend</div>
            <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Reports last 7 days</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={cluster.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={cluster.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="v" stroke={cluster.color} strokeWidth={2} fill="url(#trendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={card}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Channel Breakdown</div>
            <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>SMS vs. Voice call share</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                  <span style={{ color: "#9ca3af" }}>SMS</span>
                  <span style={{ color: cluster.color, fontWeight: 700 }}>{cluster.sms}%</span>
                </div>
                <div style={{ height: "8px", borderRadius: "999px", background: "#13131e" }}>
                  <div style={{ height: "100%", borderRadius: "999px", width: `${cluster.sms}%`, background: cluster.color }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                  <span style={{ color: "#9ca3af" }}>Call</span>
                  <span style={{ color: cluster.color, fontWeight: 700 }}>{cluster.call}%</span>
                </div>
                <div style={{ height: "8px", borderRadius: "999px", background: "#13131e" }}>
                  <div style={{ height: "100%", borderRadius: "999px", width: `${cluster.call}%`, background: cluster.color }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Regional Distribution - FIXED! */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Regional Distribution</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={cluster.regional} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {cluster.regional.map((_, i) => (
                  <Cell key={i} fill={hexToRgba(cluster.color, 0.9 - i * 0.15)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Sample Scripts */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Sample Scripts / Transcripts</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>AI-extracted representative messages from this cluster</div>
          {scripts.map((script, i) => (
            <div key={i} style={{ padding: "14px", borderRadius: "10px", marginBottom: "10px", background: "#080810", border: "1px solid #13131e", fontSize: "12px", color: "#9ca3af", lineHeight: 1.7, fontStyle: "italic" }}>
              {script}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}