// apps/web/src/pages/Admin-Tabs/PatternExplorer.jsx
import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import apiClient from "../../lib/api";

const A = "#f97316";
const CLUSTER_COLORS = {
  "OTP Phishing": "#3b82f6",
  "Bank Impersonation": "#ef4444",
  "Parcel/Delivery": "#f59e0b",
  "Investment Scam": "#22c55e",
  "Gov't Impersonation": "#a855f7",
  UNKNOWN: "#6b7280",
};

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };

function hexToRgba(hex, opacity) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export default function PatternExplorer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: res } = await apiClient.get("/api/v1/admin/reports");
        if (!cancelled) {
          setRows(res.data || []);
          const types = new Set((res.data || []).map((r) => r.topScamType || "UNKNOWN"));
          setSelectedType((prev) => prev || [...types][0] || null);
        }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message || "Could not load patterns.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>Loading patterns…</div>;
  }
  if (error) {
    return <div style={{ padding: "14px 16px", borderRadius: "10px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px" }}>{error}</div>;
  }

  // Aggregate rows into clusters by topScamType
  const byType = new Map();
  for (const r of rows) {
    const key = r.topScamType || "UNKNOWN";
    if (!byType.has(key)) byType.set(key, { name: key, reports: 0, regional: [] });
    const bucket = byType.get(key);
    bucket.reports += r.reports;
    bucket.regional.push({ region: r.region, v: r.reports });
  }
  const clusters = [...byType.values()]
    .map((c) => ({
      ...c,
      color: CLUSTER_COLORS[c.name] || "#6b7280",
      regional: c.regional.sort((a, b) => b.v - a.v).slice(0, 6),
    }))
    .sort((a, b) => b.reports - a.reports);

  if (clusters.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>
        No reports yet in your agency. Once reports are submitted, scam-type clusters will appear here.
      </div>
    );
  }

  const cluster = clusters.find((c) => c.name === selectedType) || clusters[0];

  return (
    <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 120px)", minHeight: "500px" }}>

      {/* Left: cluster list */}
      <div style={{ width: "260px", flexShrink: 0, borderRadius: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>SCAM TYPES</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Drill-down by category</div>
        </div>
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" }}>
          {clusters.map((c) => {
            const isSelected = selectedType === c.name;
            return (
              <button key={c.name} onClick={() => setSelectedType(c.name)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", textAlign: "left", cursor: "pointer",
                  borderRadius: "12px", transition: "all 0.2s ease",
                  background: isSelected ? hexToRgba(c.color, 0.1) : "#0a0a12",
                  border: isSelected ? `2px solid ${c.color}` : "2px solid #1a1a2a",
                }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>{c.name}</div>
                  <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{c.reports.toLocaleString()} reports</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", overflowY: "auto" }}>

        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: cluster.color, display: "inline-block" }} />
            <span style={{ fontSize: "18px", fontWeight: 800, color: "#fff" }}>{cluster.name}</span>
            <span style={{ fontSize: "12px", color: "#4b5563" }}>{cluster.reports.toLocaleString()} reports in your agency</span>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Regional Distribution</div>
          <ResponsiveContainer width="100%" height={Math.max(120, cluster.regional.length * 32)}>
            <BarChart data={cluster.regional} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                {cluster.regional.map((_, i) => (
                  <Cell key={i} fill={hexToRgba(cluster.color, 0.9 - i * 0.15)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>All Regions In This Cluster</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["REGION","REPORTS"].map((h) => (
                <th key={h} style={{ textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {cluster.regional.map((r) => (
                <tr key={r.region}>
                  <td style={{ padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e", color: "#fff" }}>{r.region || "Unknown"}</td>
                  <td style={{ padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e", fontFamily: "'JetBrains Mono',monospace", color: "#fff", fontWeight: 700 }}>{r.v.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}