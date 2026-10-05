// apps/web/src/pages/SuperAdmin-Tabs/SystemHealth.jsx
//
// Infrastructure health dashboard for the SuperAdmin.
//
// Verified backend contract (services/api/routes/superadmin.js →
// GET /api/v1/superadmin/system-health):
//
//   {
//     data: {
//       overall: 'operational' | 'degraded',
//       services: [{ name, status, latency, uptime, since }],
//       jobs: [{ name, last, result, duration, next }],
//       storage: [{ label, used, total, color, count, sizeBytes }],
//       sla: string,
//       uptimeHistory: [{ date, uptime, total, ok }],
//       aiHealth: { status, latency, modelVersion, error, processedReports }
//     }
//   }
//
// Design:
//   • Green accent reserved for operational states.
//   • Amber for warnings/degraded. Red for failures.
//   • All cards share #0e0e18 / #1a1a2a / 12px.

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  padding: "14px 16px 14px 0",
  fontSize: "12px",
  borderTop: "1px solid #13131e",
  verticalAlign: "middle",
};

const JOB_COLOR = {
  PASS: "#22c55e",
  Completed: "#22c55e",
  Failed: "#ef4444",
  Running: "#22c55e",
};

// ─── Helpers ──────────────────────────────────────────────────────────
function serviceStatusColor(status) {
  if (status === "Operational") return "#22c55e";
  if (status === "Degraded") return "#f59e0b";
  return "#ef4444";
}

function formatShortDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayLabel(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / (k ** i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

// ─── Section header ───────────────────────────────────────────────────
function SectionHeader({ title, subtitle, right }) {
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
      {right}
    </div>
  );
}

// ─── Small summary chip ───────────────────────────────────────────────
function Chip({ label, value, tone = "neutral" }) {
  const palette = {
    green: { fg: "#22c55e", bg: A_TINT, border: A_TINT_BORDER },
    amber: { fg: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.30)" },
    red: { fg: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.30)" },
    neutral: { fg: "#e2e8f0", bg: "#111120", border: "#1a1a2a" },
  };
  const p = palette[tone] || palette.neutral;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 14px",
        borderRadius: "10px",
        background: p.bg,
        border: `1px solid ${p.border}`,
      }}
    >
      <span
        style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#64748b",
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: p.fg,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function SystemHealth() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get(
        "/api/v1/superadmin/system-health"
      );
      setData(res.data);
      setLastFetchedAt(new Date());
    } catch (err) {
      console.error("[SystemHealth] fetch failed:", err);
      setError(
        err?.response?.data?.message || "Failed to load system health."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  // ── Derived metrics ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    const services = data?.services ?? [];
    const jobs = data?.jobs ?? [];
    const storage = data?.storage ?? [];
    const uptimeHistory = data?.uptimeHistory ?? [];
    const aiHealth = data?.aiHealth ?? null;
    const operational = services.filter((s) => s.status === "Operational")
      .length;
    const degraded = services.length - operational;
    const failedJobs = jobs.filter((j) => j.result === "Failed").length;
    const overall = data?.overall ?? "operational";
    const healthy = overall === "operational";

    const avgUptime =
      uptimeHistory.length > 0
        ? Math.round(
            uptimeHistory.reduce((sum, d) => sum + d.uptime, 0) /
              uptimeHistory.length
          )
        : null;

    return {
      services,
      jobs,
      storage,
      uptimeHistory,
      aiHealth,
      operational,
      degraded,
      failedJobs,
      overall,
      healthy,
      sla: data?.sla ?? "—",
      avgUptime,
    };
  }, [data]);

  const {
    services,
    jobs,
    storage,
    uptimeHistory,
    aiHealth,
    operational,
    degraded,
    failedJobs,
    healthy,
    sla,
    avgUptime,
  } = metrics;

  // ── Loading / error states ─────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          padding: "60px 20px",
          textAlign: "center",
          color: "#4b5563",
          fontSize: "12px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: `2px solid ${A_TINT_BORDER}`,
            borderTopColor: A,
            animation: "spin 0.8s linear infinite",
          }}
        />
        Loading system health…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "16px 18px",
          borderRadius: "10px",
          background: "#1a0606",
          border: "1px solid #ef444440",
          color: "#ef4444",
          fontSize: "13px",
        }}
      >
        {error}
      </div>
    );
  }

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
            INFRASTRUCTURE
          </span>
          <span style={{ color: "#374151" }}>·</span>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>
            Live service status, scheduled jobs, and storage utilization
          </span>
        </div>
        {lastFetchedAt && (
          <span
            style={{
              fontSize: "11px",
              color: "#4b5563",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            Last checked {formatShortDate(lastFetchedAt.toISOString())}
          </span>
        )}
      </div>

      {/* ─── Overall status banner ────────────────────────────────── */}
      <div
        style={{
          padding: "20px 24px",
          borderRadius: "12px",
          background: healthy ? "#061a0f" : "#1a0f06",
          border: `1.5px solid ${
            healthy ? A_TINT_BORDER : "rgba(245,158,11,0.30)"
          }`,
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: healthy ? A_TINT : "rgba(245,158,11,0.08)",
            border: `2px solid ${healthy ? A : "#f59e0b"}`,
            flexShrink: 0,
          }}
        >
          {healthy ? (
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
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M9 3v7M9 14v.01"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              fontSize: "16px",
              color: healthy ? A : "#f59e0b",
              lineHeight: 1.2,
              marginBottom: "3px",
            }}
          >
            {healthy ? "All Systems Operational" : "Some Systems Degraded"}
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.6 }}>
            {operational} of {services.length} services healthy ·{" "}
            {failedJobs > 0
              ? `${failedJobs} job${failedJobs === 1 ? "" : "s"} failed in the last run`
              : "all scheduled jobs ran successfully"}
            {avgUptime !== null && (
              <> · {avgUptime}% avg uptime over {uptimeHistory.length} day{uptimeHistory.length === 1 ? "" : "s"}</>
            )}
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
            flexShrink: 0,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          <div
            style={{
              fontSize: "9px",
              fontWeight: 600,
              color: "#64748b",
              letterSpacing: "0.08em",
              marginBottom: "4px",
            }}
          >
            30-DAY SLA
          </div>
          <div style={{ fontSize: "18px", color: A, fontWeight: 700 }}>
            {sla}
          </div>
        </div>
      </div>

      {/* ─── Summary chips ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <Chip
          label="Services"
          value={`${operational}/${services.length}`}
          tone={operational === services.length ? "green" : "amber"}
        />
        <Chip
          label="Degraded"
          value={String(degraded)}
          tone={degraded === 0 ? "green" : "amber"}
        />
        <Chip
          label="Job Failures"
          value={String(failedJobs)}
          tone={failedJobs === 0 ? "green" : "red"}
        />
        <Chip
          label="Snapshots"
          value={String(
            uptimeHistory.reduce((sum, d) => sum + (d.total || 0), 0)
          )}
          tone="green"
        />
      </div>

      {/* ─── AI Service card ──────────────────────────────────────── */}
      {aiHealth && (
        <div style={card}>
          <SectionHeader
            title="AI Detector Service"
            subtitle="Live status of the Hugging Face Spaces inference endpoint"
            right={
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: serviceStatusColor(aiHealth.status),
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: serviceStatusColor(aiHealth.status),
                    display: "inline-block",
                  }}
                />
                {aiHealth.status}
              </span>
            }
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "16px",
              paddingTop: "16px",
              borderTop: "1px solid #13131e",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#64748b",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                Status
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: serviceStatusColor(aiHealth.status),
                  fontWeight: 600,
                }}
              >
                {aiHealth.status}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#64748b",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                Latency
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#e2e8f0",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {aiHealth.latency}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#64748b",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                Model Version
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#e2e8f0",
                  fontFamily: "'JetBrains Mono',monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={aiHealth.modelVersion}
              >
                {aiHealth.modelVersion}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: "#64748b",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  textTransform: "uppercase",
                }}
              >
                Processed Reports
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#e2e8f0",
                  fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: 700,
                }}
              >
                {(aiHealth.processedReports ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

          {aiHealth.error && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "#1a0606",
                border: "1px solid #ef444440",
                fontSize: "11px",
                color: "#ef4444",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {aiHealth.error}
            </div>
          )}
        </div>
      )}

      {/* ─── Service Status table ─────────────────────────────────── */}
      <div style={card}>
        <SectionHeader
          title="Service Status"
          subtitle="Real-time health of each platform component"
        />
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: "620px",
            }}
          >
            <thead>
              <tr>
                {[
                  "SERVICE",
                  "STATUS",
                  "LATENCY",
                  "UPTIME (30d)",
                  "HEALTHY SINCE",
                ].map((h) => (
                  <th key={h} style={thS}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {services.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: "24px 0",
                      textAlign: "center",
                      color: "#4b5563",
                      fontSize: "12px",
                    }}
                  >
                    No service telemetry available.
                  </td>
                </tr>
              ) : (
                services.map((s) => {
                  const color = serviceStatusColor(s.status);
                  const isOk = s.status === "Operational";
                  return (
                    <tr
                      key={s.name}
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
                        {s.name}
                      </td>
                      <td style={tdS}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color,
                            fontWeight: 600,
                            fontSize: "12px",
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: color,
                              display: "inline-block",
                              boxShadow: isOk
                                ? `0 0 6px ${color}80`
                                : undefined,
                            }}
                          />
                          {s.status}
                        </span>
                      </td>
                      <td
                        style={{
                          ...tdS,
                          color: "#94a3b8",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {s.latency}
                      </td>
                      <td
                        style={{
                          ...tdS,
                          fontWeight: 600,
                          color: A,
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {s.uptime}
                      </td>
                      <td
                        style={{
                          ...tdS,
                          color: "#4b5563",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {s.since}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Operations row: Jobs + Storage ───────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: "16px",
        }}
      >
        {/* Scheduled Jobs */}
        <div style={card}>
          <SectionHeader
            title="Scheduled Jobs"
            subtitle="Backup · integrity · archival · reporting"
          />
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: "520px",
              }}
            >
              <thead>
                <tr>
                  {["JOB", "LAST RUN", "RESULT", "DURATION", "NEXT RUN"].map(
                    (h) => (
                      <th key={h} style={thS}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: "20px 0",
                        textAlign: "center",
                        color: "#4b5563",
                        fontSize: "12px",
                      }}
                    >
                      No scheduled jobs configured.
                    </td>
                  </tr>
                ) : (
                  jobs.map((j) => {
                    const color = JOB_COLOR[j.result] ?? "#6b7280";
                    return (
                      <tr key={j.name}>
                        <td
                          style={{
                            ...tdS,
                            fontWeight: 500,
                            color: "#fff",
                          }}
                        >
                          {j.name}
                        </td>
                        <td
                          style={{
                            ...tdS,
                            color: "#94a3b8",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {j.last}
                        </td>
                        <td style={tdS}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              color,
                              fontWeight: 600,
                            }}
                          >
                            <span
                              style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: color,
                                display: "inline-block",
                              }}
                            />
                            {j.result}
                          </span>
                        </td>
                        <td
                          style={{
                            ...tdS,
                            color: "#94a3b8",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {j.duration}
                        </td>
                        <td
                          style={{
                            ...tdS,
                            color: "#4b5563",
                            fontFamily: "'JetBrains Mono',monospace",
                          }}
                        >
                          {j.next}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Storage Utilization */}
        <div style={card}>
          <SectionHeader
            title="Storage Utilization"
            subtitle="Live MongoDB collection sizes"
          />
          {storage.length === 0 ? (
            <div
              style={{
                padding: "20px 0",
                textAlign: "center",
                color: "#4b5563",
                fontSize: "12px",
              }}
            >
              No storage metrics available.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {storage.map((s) => {
                const used = Number(s.used) || 0;
                const tone =
                  used >= 90
                    ? "#ef4444"
                    : used >= 75
                    ? "#f59e0b"
                    : s.color || A;
                return (
                  <div key={s.label}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: "#cbd5e1",
                          fontWeight: 500,
                        }}
                      >
                        {s.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#94a3b8",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        <strong style={{ color: "#fff" }}>{used}%</strong>{" "}
                        of {s.total}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "8px",
                        borderRadius: "999px",
                        background: "#13131e",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: "999px",
                          width: `${Math.min(100, used)}%`,
                          background: tone,
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                    {typeof s.sizeBytes === "number" && (
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "10px",
                          color: "#475569",
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {formatBytes(s.sizeBytes)}
                        {typeof s.count === "number" && s.count > 0 && (
                          <> · {s.count.toLocaleString()} doc{s.count === 1 ? "" : "s"}</>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Uptime history grid ──────────────────────────────────── */}
      <div style={card}>
        <SectionHeader
          title="Uptime History — Last 30 Days"
          subtitle={
            uptimeHistory.length === 0
              ? "No snapshots recorded yet — the health poller writes one every 5 minutes"
              : `Per-day uptime from ${uptimeHistory.reduce(
                  (sum, d) => sum + (d.total || 0),
                  0
                )} scheduled health snapshots`
          }
          right={
            <span
              style={{
                fontSize: "11px",
                color: "#4b5563",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              {sla} SLA
            </span>
          }
        />

        {uptimeHistory.length === 0 ? (
          <div
            style={{
              padding: "28px 16px",
              textAlign: "center",
              borderRadius: "10px",
              background: "#080810",
              border: "1px solid #13131e",
              fontSize: "12px",
              color: "#4b5563",
            }}
          >
            Snapshots will appear here once the health poller has run for the
            first time. The poller writes one snapshot every 5 minutes.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {uptimeHistory.map((day) => {
                const tone =
                  day.uptime >= 99
                    ? A
                    : day.uptime >= 95
                    ? "#f59e0b"
                    : "#ef4444";
                return (
                  <div
                    key={day.date}
                    style={{
                      width: "20px",
                      height: "32px",
                      borderRadius: "4px",
                      background: `${tone}40`,
                      border: `1px solid ${tone}60`,
                      transition: "all 0.2s ease",
                    }}
                    title={`${formatDayLabel(day.date)} — ${day.uptime}% uptime (${day.ok}/${day.total} snapshots OK)`}
                  />
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "18px",
                marginTop: "14px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: `${A}40`,
                    border: `1px solid ${A}60`,
                  }}
                />
                ≥99% — Healthy
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: "rgba(245,158,11,0.25)",
                    border: "1px solid rgba(245,158,11,0.4)",
                  }}
                />
                ≥95% — Degraded
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: "#64748b",
                }}
              >
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "2px",
                    background: "rgba(239,68,68,0.25)",
                    border: "1px solid rgba(239,68,68,0.4)",
                  }}
                />
                &lt;95% — Outage
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "11px",
                  color: "#4b5563",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {uptimeHistory.length} day
                {uptimeHistory.length === 1 ? "" : "s"} with data
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}