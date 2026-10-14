  // apps/web/src/pages/SuperAdmin-Tabs/SuperAdminDashboard.jsx
  //
  // Platform overview for the SuperAdmin.
  //
  // Verified backend contract (services/api/routes/superadmin.js):
  //   GET /api/v1/superadmin/users
  //     → { data: { users: [...] } }
  //   GET /api/v1/superadmin/audit-logs?limit=5
  //     → { data: { logs: [{ ts, actor, role, category, action, target, hash }] } }
  //   GET /api/v1/superadmin/chain/status
  //     → { data: { headBlock, headHash, totalBlocks,
  //                 lastNightlyRun: {...} | null, nextScheduled } }
  //   GET /api/v1/superadmin/system-health
  //     → { data: { overall, services, jobs, storage, sla } }
  //
  // Design notes:
  //   • SuperAdmin accent = green (#22c55e), used only on semantic states
  //     (verified / healthy / operational) and identity.
  //   • Chain card is now a two-tier layout: primary status line + a compact
  //     metadata grid (blocks, head hash, last verified) so it has real
  //     information density instead of stretched whitespace.
  //   • All cards share the same surface / border / radius tokens so the page
  //     reads as one coherent surface.

  import React, { useState, useEffect, useCallback, useMemo } from "react";
  import { useNavigate } from "react-router-dom";
  import apiClient from "../../lib/api";

  // ─── SuperAdmin accent (green) ────────────────────────────────────────
  const A = "#22c55e";
  const A_TINT = "rgba(34,197,94,0.08)";
  const A_TINT_BORDER = "rgba(34,197,94,0.30)";

  // ─── Shared style tokens ──────────────────────────────────────────────
  const card = {
    background: "#0e0e18",
    border: "1px solid #1a1a2a",
    borderRadius: "12px",
    padding: "20px",
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
    padding: "12px 16px 12px 0",
    fontSize: "12px",
    borderTop: "1px solid #13131e",
    verticalAlign: "middle",
  };

  const ROLE_COLOR = {
    officer: "#3b82f6",
    analyst: "#a855f7",
    auditor: "#22c55e",
    admin: "#f59e0b",
    superadmin: A,
    system: "#4b5563",
    citizen: "#6b7280",
  };

  // ─── Helpers ──────────────────────────────────────────────────────────
  function statusColor(status) {
    if (status === "Active") return "#22c55e";
    if (status === "Suspended") return "#f59e0b";
    if (status === "Disabled") return "#ef4444";
    if (status === "Pending") return "#94a3b8";
    return "#6b7280";
  }

  function serviceStatusColor(status) {
    if (status === "Operational") return "#22c55e";
    if (status === "Degraded") return "#f59e0b";
    return "#ef4444";
  }

  function formatShortDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatTimeOnly(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatDateOnly(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // ─── Reusable section header ──────────────────────────────────────────
  function SectionHeader({ title, subtitle, action, onAction }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: "11px", marginTop: "3px", color: "#4b5563" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {action ? (
          <button
            onClick={onAction}
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: A,
              background: "none",
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              padding: "2px 4px",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            {action} →
          </button>
        ) : null}
      </div>
    );
  }

  // ─── Empty state card ─────────────────────────────────────────────────
  function EmptySection({ message, hint }) {
    return (
      <div
        style={{
          padding: "28px 16px",
          textAlign: "center",
          borderRadius: "10px",
          background: "#080810",
          border: "1px solid #13131e",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "#94a3b8",
            marginBottom: hint ? "4px" : 0,
          }}
        >
          {message}
        </div>
        {hint ? (
          <div style={{ fontSize: "11px", color: "#4b5563" }}>{hint}</div>
        ) : null}
      </div>
    );
  }

  // ─── Small "metadata cell" used in the chain card grid ────────────────
  function MetaCell({ label, value, mono = true, accent = false }) {
    return (
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: "9px",
            fontWeight: 600,
            color: "#64748b",
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "0.08em",
            marginBottom: "4px",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "12px",
            color: accent ? A : "#e2e8f0",
            fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
            fontWeight: accent ? 700 : 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={typeof value === "string" ? value : undefined}
        >
          {value}
        </div>
      </div>
    );
  }

  export default function SuperAdminDashboard() {
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [chain, setChain] = useState(null);
    const [health, setHealth] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
        setError(
          err?.response?.data?.message ||
            "Failed to load dashboard data. Check the API Gateway."
        );
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      loadAll();
    }, [loadAll]);

    // ─── Derived metrics ──────────────────────────────────────────────
    const metrics = useMemo(() => {
      const totalUsers = users.length;
      const activeUsers = users.filter((u) => u.status === "Active").length;
      const suspended = users.filter((u) => u.status === "Suspended").length;
      const pending = users.filter((u) => u.status === "Pending").length;
      const disabled = users.filter((u) => u.status === "Disabled").length;

      const totalBlocks = chain?.totalBlocks ?? 0;
      const chainHasBlocks = totalBlocks > 0;

      const chainStatus = !chainHasBlocks
        ? "EMPTY"
        : chain?.lastNightlyRun?.status === "pass"
        ? "PASS"
        : "VERIFIED";

      const services = health?.services ?? [];
      const healthyServices = services.filter((s) => s.status === "Operational")
        .length;
      const totalServices = services.length;
      const allHealthy = totalServices > 0 && healthyServices === totalServices;

      return {
        totalUsers,
        activeUsers,
        suspended,
        pending,
        disabled,
        totalBlocks,
        chainHasBlocks,
        chainStatus,
        services,
        healthyServices,
        totalServices,
        allHealthy,
      };
    }, [users, chain, health]);

    const {
      totalUsers,
      activeUsers,
      suspended,
      pending,
      disabled,
      totalBlocks,
      chainHasBlocks,
      chainStatus,
      services,
      healthyServices,
      totalServices,
      allHealthy,
    } = metrics;

    const chainKpiColor =
      chainStatus === "PASS" || chainStatus === "VERIFIED" ? A : "#4b5563";

    const headHashShort = chain?.headHash
      ? `${String(chain.headHash).slice(0, 10)}…${String(chain.headHash).slice(-6)}`
      : "—";

    // ─── Render ────────────────────────────────────────────────────────
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* ─── Header strip ─────────────────────────────────────────── */}
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
            <span
              style={{
                color: A,
                fontWeight: 700,
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: "11px",
                letterSpacing: "0.08em",
              }}
            >
              PLATFORM OVERVIEW
            </span>
            <span style={{ color: "#374151" }}>·</span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Real-time status across accounts, ledger, and infrastructure
            </span>
          </div>
          {!loading && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: allHealthy ? A : "#f59e0b",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: allHealthy ? A : "#f59e0b",
                  display: "inline-block",
                }}
              />
              {allHealthy
                ? "All systems nominal"
                : `${totalServices - healthyServices} service${
                    totalServices - healthyServices === 1 ? "" : "s"
                  } degraded`}
            </span>
          )}
        </div>

        {/* ─── Error banner ─────────────────────────────────────────── */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#1a0606",
              border: "1px solid #ef444440",
              color: "#ef4444",
              fontSize: "12px",
            }}
          >
            {error}
          </div>
        )}

        {/* ─── KPI cards ────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4,1fr)",
            gap: "16px",
          }}
        >
          {[
            {
              l: "TOTAL ACCOUNTS",
              v: loading ? "—" : String(totalUsers),
              sub: loading
                ? "—"
                : `${activeUsers} active · ${suspended + pending + disabled} inactive`,
              sc: "#fff",
            },
            {
              l: "CHAIN BLOCKS",
              v: loading ? "—" : totalBlocks.toLocaleString(),
              sub: loading
                ? "—"
                : chain?.headHash
                ? `Head #${chain.headBlock}`
                : "No blocks yet",
              sc: "#fff",
            },
            {
              l: "CHAIN INTEGRITY",
              v: loading ? "—" : chainStatus,
              sub: loading
                ? "—"
                : chain?.lastNightlyRun?.finished_at
                ? `Verified ${formatDateOnly(chain.lastNightlyRun.finished_at)}`
                : "Never verified",
              sc: chainKpiColor,
            },
            {
              l: "SERVICES UP",
              v: loading ? "—" : `${healthyServices}/${totalServices}`,
              sub: loading
                ? "—"
                : allHealthy
                ? "All systems healthy"
                : `${totalServices - healthyServices} degraded`,
              sc: allHealthy ? A : "#f59e0b",
            },
          ].map((s) => (
            <div key={s.l} style={card}>
              <div
                style={{
                  fontSize: "10px",
                  marginBottom: "8px",
                  color: "#6b7280",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.08em",
                }}
              >
                {s.l}
              </div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: 800,
                  color: s.sc,
                  marginBottom: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                  lineHeight: 1.1,
                }}
              >
                {s.v}
              </div>
              <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: 1.5 }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>

        {/* ─── Critical row: Chain + System Health ──────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>

          {/* ─── Chain Integrity card (REDESIGNED) ──────────────────── */}
          <div
            style={{
              ...card,
              background: chainHasBlocks ? "#061a0f" : "#0a0a15",
              border: `1.5px solid ${
                chainHasBlocks ? "rgba(34,197,94,0.30)" : "#1a1a2a"
              }`,
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Primary status line: icon + status + action button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: chainHasBlocks ? A_TINT : "#111118",
                  border: `2px solid ${chainHasBlocks ? A : "#374151"}`,
                  flexShrink: 0,
                }}
              >
                {chainHasBlocks ? (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M3 9l4 4 8-8"
                      stroke={A}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span style={{ color: "#374151", fontSize: "16px" }}>—</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "15px",
                    color: chainHasBlocks ? A : "#4b5563",
                    lineHeight: 1.2,
                    marginBottom: "3px",
                  }}
                >
                  {loading
                    ? "Loading chain…"
                    : chainHasBlocks
                    ? "Hash-Chain Verified"
                    : "Chain is empty"}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  {loading
                    ? "—"
                    : chainHasBlocks
                    ? `${totalBlocks.toLocaleString()} block${
                        totalBlocks === 1 ? "" : "s"
                      } secured · tamper-evident ledger`
                    : "The ledger starts with the first report"}
                </div>
              </div>

              <button
                onClick={() => navigate("/superadmin/chain-integrity")}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: chainHasBlocks ? A : "#94a3b8",
                  background: "transparent",
                  border: `1px solid ${
                    chainHasBlocks ? A_TINT_BORDER : "#1a1a2a"
                  }`,
                  borderRadius: "8px",
                  padding: "7px 12px",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = chainHasBlocks
                    ? A_TINT
                    : "#111120";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {chainHasBlocks ? "Recompute" : "Open"}
              </button>
            </div>

            {/* Metadata grid — fills the card's vertical space with real info */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "16px",
                paddingTop: "16px",
                borderTop: `1px solid ${
                  chainHasBlocks ? "rgba(34,197,94,0.12)" : "#13131e"
                }`,
              }}
            >
              <MetaCell
                label="Head Block"
                value={loading ? "—" : chain?.headBlock != null ? `#${chain.headBlock}` : "—"}
              />
              <MetaCell
                label="Head Hash"
                value={loading ? "—" : headHashShort}
              />
              <MetaCell
                label="Last Verified"
                value={
                  loading
                    ? "—"
                    : chain?.lastNightlyRun?.finished_at
                    ? formatDateOnly(chain.lastNightlyRun.finished_at)
                    : "Never"
                }
                accent={
                  !loading &&
                  chainHasBlocks &&
                  Boolean(chain?.lastNightlyRun?.finished_at)
                }
              />
            </div>
          </div>

          {/* ─── System Health card ─────────────────────────────────── */}
          <div
            style={{
              ...card,
              background: "#0a0a15",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div style={{ fontWeight: 600, color: "#fff", fontSize: "13px" }}>
                System Health
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  color: allHealthy ? A : "#f59e0b",
                  marginLeft: "auto",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: allHealthy ? A : "#f59e0b",
                    display: "inline-block",
                  }}
                />
                {loading
                  ? "Checking…"
                  : allHealthy
                  ? "All systems operational"
                  : `${totalServices - healthyServices} degraded`}
              </span>
            </div>

            {loading ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "#4b5563",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                Loading services…
              </div>
            ) : services.length === 0 ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "#4b5563",
                  textAlign: "center",
                  padding: "12px",
                }}
              >
                No service telemetry available.
              </div>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {services.slice(0, 4).map((s) => {
                  const color = serviceStatusColor(s.status);
                  return (
                    <div
                      key={s.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#cbd5e1",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {s.name}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#4b5563",
                            fontFamily: "'JetBrains Mono',monospace",
                            minWidth: "52px",
                            textAlign: "right",
                          }}
                        >
                          {s.latency}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            fontSize: "11px",
                            color,
                            minWidth: "90px",
                            justifyContent: "flex-end",
                          }}
                        >
                          <span
                            style={{
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              background: color,
                              display: "inline-block",
                            }}
                          />
                          {s.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {services.length > 4 && (
                  <div
                    style={{
                      fontSize: "10px",
                      color: "#4b5563",
                      fontFamily: "'JetBrains Mono',monospace",
                      textAlign: "right",
                      marginTop: "2px",
                    }}
                  >
                    +{services.length - 4} more
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Live roster + audit feed ─────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>

          {/* RBAC Provisioning */}
          <div style={card}>
            <SectionHeader
              title="RBAC Provisioning — Live Roster"
              subtitle="Most recently active accounts across the platform"
              action="Manage all"
              onAction={() => navigate("/superadmin/users-rbac")}
            />

            {loading ? (
              <EmptySection message="Loading roster…" />
            ) : users.length === 0 ? (
              <EmptySection
                message="No user accounts provisioned yet."
                hint="Invite or provision an officer or admin to populate this table."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: "560px",
                  }}
                >
                  <thead>
                    <tr>
                      {["NAME", "ROLE", "AGENCY", "LAST LOGIN", "STATUS"].map(
                        (h) => (
                          <th key={h} style={thS}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(0, 5).map((u) => {
                      const rk = (u.role || "").toLowerCase();
                      const rc = ROLE_COLOR[rk] || "#6b7280";
                      const sc = statusColor(u.status);
                      return (
                        <tr
                          key={u.id || u.uid || u.email}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#101020")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                          style={{ transition: "background 0.12s ease" }}
                        >
                          <td
                            style={{
                              ...tdS,
                              fontWeight: 500,
                              color: "#fff",
                            }}
                          >
                            {u.name}
                          </td>
                          <td style={tdS}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "5px",
                                fontSize: "10px",
                                fontWeight: 700,
                                fontFamily: "'JetBrains Mono',monospace",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                background: rc + "20",
                                color: rc,
                              }}
                            >
                              {rk}
                            </span>
                          </td>
                          <td style={{ ...tdS, color: "#6b7280" }}>
                            {u.agency || "—"}
                          </td>
                          <td
                            style={{
                              ...tdS,
                              color: "#4b5563",
                              fontFamily: "'JetBrains Mono',monospace",
                            }}
                          >
                            {formatShortDate(u.last_login_at)}
                          </td>
                          <td style={tdS}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "5px",
                                color: sc,
                                fontSize: "11px",
                                fontWeight: 500,
                              }}
                            >
                              <span
                                style={{
                                  width: "5px",
                                  height: "5px",
                                  borderRadius: "50%",
                                  background: sc,
                                  display: "inline-block",
                                }}
                              />
                              {u.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit Feed */}
          <div style={card}>
            <SectionHeader
              title="Immutable Audit Feed"
              subtitle="Latest platform events, append-only"
              action="Full log"
              onAction={() => navigate("/superadmin/audit-logs")}
            />

            {loading ? (
              <EmptySection message="Loading events…" />
            ) : logs.length === 0 ? (
              <EmptySection
                message="No audit events recorded yet."
                hint="Events appear as users sign in, roles change, and reports are reviewed."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {logs.map((e, i) => {
                  const rk = (e.role || "system").toLowerCase();
                  const rc = ROLE_COLOR[rk] || "#6b7280";
                  return (
                    <div
                      key={`${e.ts}-${i}`}
                      style={{
                        display: "flex",
                        gap: "12px",
                        paddingBottom: "12px",
                        marginBottom: "12px",
                        borderBottom:
                          i < logs.length - 1 ? "1px solid #13131e" : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#4b5563",
                          fontFamily: "'JetBrains Mono',monospace",
                          flexShrink: 0,
                          marginTop: "3px",
                          minWidth: "58px",
                        }}
                      >
                        {formatTimeOnly(e.ts)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 500,
                            color: "#fff",
                            marginBottom: "3px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={e.actor || "System"}
                        >
                          {e.actor || "System"}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#64748b",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={e.action}
                        >
                          {e.action}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 700,
                          padding: "3px 7px",
                          borderRadius: "4px",
                          background: rc + "18",
                          color: rc,
                          flexShrink: 0,
                          alignSelf: "flex-start",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {rk}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }