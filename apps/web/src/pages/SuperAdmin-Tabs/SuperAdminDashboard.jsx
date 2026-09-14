// apps/web/src/pages/SuperAdmin-Tabs/SuperAdminDashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../lib/api";

const A = "#22c55e";

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

const ROLE_COLOR = {
  officer: "#3b82f6", analyst: "#a855f7", auditor: "#22c55e",
  admin: "#f59e0b", superadmin: A, system: "#4b5563", citizen: "#6b7280",
};

export default function SuperAdminDashboard() {
  const navigate = useNavigate();

  const [users, setUsers]     = useState([]);
  const [logs, setLogs]       = useState([]);
  const [chain, setChain]     = useState(null);
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, logsRes, chainRes, healthRes] = await Promise.all([
        apiClient.get("/api/v1/superadmin/users"),
        apiClient.get("/api/v1/superadmin/audit-logs", { params: { limit: 5 } }),
        apiClient.get("/api/v1/superadmin/chain/status"),
        apiClient.get("/api/v1/superadmin/system-health"),
      ]);

      setUsers(usersRes.data.data.users ?? []);
      setLogs(logsRes.data.data.logs ?? []);
      setChain(chainRes.data.data);
      setHealth(healthRes.data.data);
    } catch (err) {
      console.error("[SuperAdminDashboard] load failed:", err);
      setError(err?.response?.data?.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived KPIs ───────────────────────────────────────────
  const totalUsers   = users.length;
  const activeUsers  = users.filter(u => u.status === "Active").length;
  const suspended    = users.filter(u => u.status === "Suspended").length;
  const pendingUsers = users.filter(u => u.status === "Pending").length;

  const chainOk      = chain && chain.totalBlocks > 0;
  const chainStatus  = !chain || chain.totalBlocks === 0 ? "EMPTY" : "PASS";
  const chainColor   = chainStatus === "PASS" ? "#22c55e" : chainStatus === "EMPTY" ? "#4b5563" : "#ef4444";

  const healthyServices = (health?.services ?? []).filter(s => s.status === "Operational").length;
  const totalServices   = (health?.services ?? []).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {[
          { l: "TOTAL ACCOUNTS", v: loading ? "—" : String(totalUsers), sub: `${activeUsers} active · ${suspended + pendingUsers} inactive`, sc: "#fff" },
          { l: "CHAIN BLOCKS",   v: loading ? "—" : String(chain?.totalBlocks ?? 0), sub: chain?.headHash ? `Head #${chain.headBlock}` : "No blocks yet", sc: "#fff" },
          { l: "CHAIN INTEGRITY",v: loading ? "—" : chainStatus, sub: chain?.lastNightlyRun?.finished_at ? `Last run ${new Date(chain.lastNightlyRun.finished_at).toLocaleDateString("en-PH")}` : "Never verified", sc: chainColor },
          { l: "SERVICES UP",    v: loading ? "—" : `${healthyServices}/${totalServices}`, sub: healthyServices === totalServices ? "All systems healthy" : "Some degraded", sc: healthyServices === totalServices ? "#22c55e" : "#f59e0b" },
        ].map(s => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.08em" }}>{s.l}</div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: s.sc, marginBottom: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>

        {/* RBAC roster (top 5) */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>RBAC Provisioning — Live Roster</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Most recently active accounts</div>
            </div>
            <button onClick={() => navigate("/superadmin/users-rbac")} style={{ fontSize: "11px", fontWeight: 600, color: A, background: "none", border: "none", cursor: "pointer" }}>Manage all →</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["NAME","ROLE","AGENCY","LAST LOGIN","STATUS"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading…</td></tr>}
              {!loading && users.slice(0, 5).map(u => {
                const rk = (u.role || "").toLowerCase();
                const rc = ROLE_COLOR[rk] || "#6b7280";
                const active = u.status === "Active";
                return (
                  <tr key={u.id}>
                    <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{u.name}</td>
                    <td style={tdS}>
                      <span style={{ padding: "2px 7px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: rc + "20", color: rc, textTransform: "capitalize" }}>{rk}</span>
                    </td>
                    <td style={{ ...tdS, color: "#6b7280" }}>{u.agency || "—"}</td>
                    <td style={{ ...tdS, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td style={tdS}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: active ? "#22c55e" : "#f59e0b" }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: active ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
                        {u.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Immutable audit feed (top 5) */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Immutable Audit Feed</div>
            <button onClick={() => navigate("/superadmin/audit-logs")} style={{ fontSize: "11px", fontWeight: 600, color: A, background: "none", border: "none", cursor: "pointer" }}>Full log →</button>
          </div>
          {loading && <div style={{ fontSize: "12px", color: "#4b5563", textAlign: "center", padding: "16px" }}>Loading…</div>}
          {!loading && logs.length === 0 && <div style={{ fontSize: "12px", color: "#4b5563", textAlign: "center", padding: "16px" }}>No audit events yet.</div>}
          {!loading && logs.map((e, i) => {
            const rk = (e.role || "system").toLowerCase();
            const rc = ROLE_COLOR[rk] || "#6b7280";
            return (
              <div key={i} style={{ display: "flex", gap: "12px", paddingBottom: "12px", marginBottom: "12px", borderBottom: i < logs.length - 1 ? "1px solid #13131e" : "none" }}>
                <span style={{ fontSize: "10px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, marginTop: "2px", minWidth: "56px" }}>
                  {e.ts ? new Date(e.ts).toLocaleString("en-PH", { hour: "2-digit", minute: "2-digit" }) : "—"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "11px", fontWeight: 500, color: "#fff", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.actor}
                  </div>
                  <div style={{ fontSize: "11px", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.action}</div>
                </div>
                <span style={{ fontSize: "9px", fontWeight: 600, padding: "2px 6px", borderRadius: "4px", background: rc + "20", color: rc, flexShrink: 0, alignSelf: "flex-start", textTransform: "capitalize" }}>{rk}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chain + Health row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

        {/* Chain card */}
        <div style={{ ...card, background: chainOk ? "#061a0f" : "#0a0a15", border: `1.5px solid ${chainOk ? "#22c55e40" : "#1a1a2a"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: chainOk ? "#14412a" : "#111118", border: `2px solid ${chainOk ? "#22c55e" : "#374151"}`, flexShrink: 0 }}>
              {chainOk ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M3 9l4 4 8-8" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <span style={{ color: "#374151", fontSize: "16px" }}>—</span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "14px", color: chainOk ? "#22c55e" : "#4b5563" }}>
                {loading ? "Loading chain…" : chainOk ? `Hash-Chain: VERIFIED` : "Chain is empty"}
              </div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {loading ? "—" : chainOk ? `${chain.totalBlocks.toLocaleString()} blocks · Head #${chain.headBlock}` : "No blocks yet"}
              </div>
            </div>
            <button onClick={() => navigate("/superadmin/chain-integrity")} style={{ fontSize: "11px", fontWeight: 600, color: chainOk ? "#22c55e" : A, background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>
              {chainOk ? "Recompute →" : "Open →"}
            </button>
          </div>
        </div>

        {/* Health mini card */}
        <div style={{ ...card, background: "#0a0a15", border: "1.5px solid #1a1a2a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <div style={{ fontWeight: 600, color: "#fff", fontSize: "13px" }}>System Health</div>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: healthyServices === totalServices ? "#22c55e" : "#f59e0b", marginLeft: "auto" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: healthyServices === totalServices ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
              {loading ? "Checking…" : healthyServices === totalServices ? "All systems operational" : `${totalServices - healthyServices} degraded`}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {(health?.services ?? []).slice(0, 4).map(s => {
              const ok = s.status === "Operational";
              return (
                <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{s.latency}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: ok ? "#22c55e" : "#f59e0b" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: ok ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
                      {s.status}
                    </span>
                  </div>
                </div>
              );
            })}
            {loading && <div style={{ fontSize: "11px", color: "#4b5563", textAlign: "center", padding: "8px" }}>Loading…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}