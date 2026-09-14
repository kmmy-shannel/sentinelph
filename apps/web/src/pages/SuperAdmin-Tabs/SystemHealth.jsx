// apps/web/src/pages/SuperAdmin-Tabs/SystemHealth.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

const JOB_COLOR = { PASS: "#22c55e", Completed: "#22c55e", Failed: "#ef4444", Running: A };

export default function SystemHealth() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get("/api/v1/superadmin/system-health");
      setData(res.data);
    } catch (err) {
      console.error("[SystemHealth] fetch failed:", err);
      setError(err?.response?.data?.message || "Failed to load system health.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHealth(); }, [loadHealth]);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>
        Loading system health…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "14px 18px", borderRadius: "10px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px" }}>
        {error}
      </div>
    );
  }

  const services = data?.services ?? [];
  const jobs     = data?.jobs ?? [];
  const storage  = data?.storage ?? [];
  const sla      = data?.sla ?? "—";
  const overall  = data?.overall ?? "operational";
  const healthy  = overall === "operational";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Status banner */}
      <div style={{ padding: "16px 20px", borderRadius: "12px", background: healthy ? "#061a0f" : "#1a0f06", border: `1.5px solid ${healthy ? "#22c55e40" : "#f59e0b40"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: healthy ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
          <span style={{ fontWeight: 700, color: healthy ? "#22c55e" : "#f59e0b", fontSize: "14px" }}>
            {healthy ? "All Systems Operational" : "Some Systems Degraded"}
          </span>
          <span style={{ fontSize: "12px", color: "#4b5563" }}>
            {services.filter(s => s.status === "Operational").length} of {services.length} services healthy
          </span>
        </div>
        <span style={{ fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>
          Last checked: {new Date().toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Services table */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Service Status</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Live infrastructure health</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["SERVICE","STATUS","LATENCY","UPTIME (30d)","HEALTHY SINCE"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {services.map(s => {
              const ok = s.status === "Operational";
              return (
                <tr key={s.name}>
                  <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{s.name}</td>
                  <td style={tdS}>
                    <span style={{ display: "flex", alignItems: "center", gap: "5px", color: ok ? "#22c55e" : "#f59e0b", fontWeight: 600, fontSize: "12px" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: ok ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
                      {s.status}
                    </span>
                  </td>
                  <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{s.latency}</td>
                  <td style={{ ...tdS, fontWeight: 600, color: "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>{s.uptime}</td>
                  <td style={{ ...tdS, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{s.since}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scheduled jobs */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Scheduled Jobs</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Backup · integrity · archival · reporting</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["JOB","LAST RUN","RESULT","DURATION","NEXT RUN"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {jobs.map(j => (
              <tr key={j.name}>
                <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{j.name}</td>
                <td style={{ ...tdS, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
                  {j.last ? (typeof j.last === "string" ? j.last : new Date(j.last).toLocaleString("en-PH")) : "—"}
                </td>
                <td style={tdS}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: JOB_COLOR[j.result] ?? "#6b7280", fontWeight: 600 }}>
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: JOB_COLOR[j.result] ?? "#6b7280", display: "inline-block" }} />
                    {j.result}
                  </span>
                </td>
                <td style={{ ...tdS, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{j.duration}</td>
                <td style={{ ...tdS, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{j.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Storage + Uptime widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Storage */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>Storage Utilization</div>
          {storage.map(s => (
            <div key={s.label} style={{ marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                <span style={{ color: "#9ca3af" }}>{s.label}</span>
                <span style={{ color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{s.used}% of {s.total}</span>
              </div>
              <div style={{ height: "6px", borderRadius: "999px", background: "#13131e" }}>
                <div style={{ height: "100%", borderRadius: "999px", width: `${s.used}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Uptime */}
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "16px" }}>API Uptime — Last 30 Days</div>
          <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
            {Array.from({ length: 30 }, (_, i) => (
              <div key={i} style={{ width: "16px", height: "32px", borderRadius: "4px", background: "#22c55e30", border: "1px solid #22c55e20" }}
                title={`Day ${i + 1} — 100% uptime`} />
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#22c55e30", border: "1px solid #22c55e20" }} />
              <span style={{ fontSize: "11px", color: "#4b5563" }}>Operational</span>
            </div>
            <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: "#22c55e", fontFamily: "'JetBrains Mono',monospace" }}>{sla} SLA</span>
          </div>
        </div>
      </div>
    </div>
  );
} 