// apps/web/src/pages/SuperAdmin-Tabs/AuditLogs.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const ROLE_COLOR = {
  officer: "#3b82f6",
  analyst: "#a855f7",
  auditor: "#22c55e",
  admin: "#f59e0b",
  superadmin: A,
  system: "#4b5563",
  citizen: "#6b7280",
};
const CAT_COLOR = {
  chain: "#22c55e",
  system: "#4b5563",
  blacklist: "#ef4444",
  export: "#a855f7",
  kms: A,
  rbac: "#3b82f6",
  vote: "#f59e0b",
  auth: "#06b6d4",
};

export default function AuditLogs() {
  const [logs, setLogs]                 = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState("");
  const [catFilter, setCatFilter]       = useState("all");
  const [roleFilter, setRoleFilter]     = useState("all");

  // ── Fetch logs ─────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get("/api/v1/superadmin/audit-logs", {
        params: { limit: 200 },
      });
      setLogs(data.data.logs ?? []);
    } catch (err) {
      console.error("[AuditLogs] fetch failed:", err);
      setError(err?.response?.data?.message || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // ── Client-side filtering ──────────────────────────────────
  const filtered = logs.filter((e) => {
    const cat = (e.category || "").toLowerCase();
    const role = (e.role || "").toLowerCase();
    const mc = catFilter === "all" || cat === catFilter;
    const mr = roleFilter === "all" || role === roleFilter;

    const q = search.toLowerCase();
    const mq =
      !search ||
      (e.actor || "").toLowerCase().includes(q) ||
      (e.action || "").toLowerCase().includes(q) ||
      (e.target || "").toLowerCase().includes(q);

    return mc && mr && mq;
  });

  // Dynamic filter lists — exclude the em-dash placeholder
  const categories = ["all", ...new Set(
    logs
      .map((e) => (e.category || "").toLowerCase())
      .filter((c) => c && c !== "—")
  )];
  const roles = ["all", ...new Set(
    logs
      .map((e) => (e.role || "").toLowerCase())
      .filter(Boolean)
  )];

  return (
    <div>
      {/* Immutability notice */}
      <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", background: "#0a0a12", border: "1px solid #1a1a2a", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <span style={{ color: A, flexShrink: 0 }}>🔒</span>
        <p style={{ fontSize: "12px", color: "#4b5563", margin: 0, lineHeight: 1.6 }}>
          This log is structurally immutable and append-only. No entry can be edited, deleted, or archived — not even by the Superadmin.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
            <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, target…"
            style={{ padding: "8px 12px 8px 28px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", width: "220px" }}
          />
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {categories.slice(0, 8).map((c) => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, cursor: "pointer", background: catFilter === c ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: catFilter === c ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {roles.slice(0, 7).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              style={{ padding: "6px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 500, cursor: "pointer", background: roleFilter === r ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: roleFilter === r ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}
            >
              {r === "all" ? "All Roles" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Event Log</div>
          <span style={{ fontSize: "11px", color: "#4b5563" }}>
            Append-only · {loading ? "loading…" : `${filtered.length} of ${logs.length} events`}
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["TIMESTAMP","ACTOR","ROLE","CATEGORY","ACTION","TARGET","BLOCK HASH"].map((h) => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading audit log…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No audit entries match the current filters.</td></tr>
            )}
            {!loading && filtered.map((e, i) => {
              const roleKey = (e.role || "system").toLowerCase();
              const catKey = (e.category || "").toLowerCase();
              const rc = ROLE_COLOR[roleKey] || "#6b7280";
              const cc = CAT_COLOR[catKey] || "#6b7280";
              return (
                <tr key={i} style={{ borderBottom: "1px solid #13131e" }}
                  onMouseEnter={(el) => (el.currentTarget.style.background = "#111120")}
                  onMouseLeave={(el) => (el.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 16px", fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                    {e.ts ? new Date(e.ts).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#fff", whiteSpace: "nowrap" }}>{e.actor || "—"}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ padding: "2px 7px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, background: rc + "20", color: rc }}>{roleKey}</span>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ padding: "2px 7px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, background: cc + "18", color: cc }}>{e.category || "—"}</span>
                  </td>
                  <td style={{ padding: "10px 16px", fontSize: "12px", color: "#9ca3af", maxWidth: "280px" }}>{e.action}</td>
                  <td style={{ padding: "10px 16px", fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{e.target || "—"}</td>
                  <td style={{ padding: "10px 16px", fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>{e.hash || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}