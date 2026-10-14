// apps/web/src/pages/Admin-Tabs/AIModelInsights.jsx
import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import apiClient from "../../lib/api";

// ─── Admin accent (purple) ────────────────────────────────────────────
const A = "#a855f7";
const A_SOFT = "#c084fc";

// Human-friendly subtype names.
const SUBTYPE_LABELS = {
  personal_conversational: "Personal Conversation",
  two_factor_auth: "One-Time Password (OTP)",
  appointment_reminder: "Appointment Reminder",
  delivery_tracking: "Delivery Tracking",
  bank_activity_alert: "Bank Activity Alert",
  brand_marketing: "Brand Marketing",
  phishing_link: "Phishing Link (Smishing)",
  fake_prize_lottery: "Fake Prize / Lottery",
  wrong_number_baiting: "Wrong-Number Baiting",
  urgent_fine_toll: "Urgent Fine / Toll",
  impersonation_family: "Impersonation (Family)",
};

function labelSubtype(subtype) {
  if (!subtype) return null;
  return SUBTYPE_LABELS[subtype] || subtype;
}

const TIER_STYLES = {
  malicious: { bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.30)", text: "#fb7185", dot: "#f43f5e" },
  grey_area: { bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.30)", text: "#facc15", dot: "#eab308" },
  legitimate: { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.30)", text: "#34d399", dot: "#10b981" },
  uncertain: { bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.25)", text: "#94a3b8", dot: "#94a3b8" },
  unavailable: { bg: "rgba(148,163,184,0.05)", border: "rgba(148,163,184,0.15)", text: "#64748b", dot: "#64748b" },
};

const RISK_COLORS = {
  HIGH: "#f43f5e",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
  UNKNOWN: "#6b7280",
};

const STATUS_COLORS = {
  blacklisted: "#22c55e",
  approved: "#22c55e",
  rejected: "#6b7280",
  pending: "#94a3b8",
  under_review: "#f59e0b",
  one_approval: "#3b82f6",
  two_approvals: "#a855f7",
};

function labelStatus(status) {
  if (!status) return "—";
  if (status === "one_approval") return "1 Approval";
  if (status === "two_approvals") return "2 Approvals";
  if (status === "under_review") return "Under Review";
  if (status === "blacklisted") return "Blacklisted";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS = {
  textAlign: "left",
  paddingBottom: "10px",
  paddingRight: "16px",
  fontWeight: 600,
  color: "#64748b",
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: "10px",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};
const tdS = {
  padding: "14px 16px 14px 0",
  fontSize: "12px",
  borderTop: "1px solid #13131e",
  verticalAlign: "middle",
};

function pct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function AIModelInsights() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res } = await apiClient.get("/api/v1/admin/ai-insights");
      setData(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not load AI insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>
        Loading AI insights…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "14px 16px", borderRadius: "10px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px" }}>
        {error}
      </div>
    );
  }

  const metrics = data?.modelMetrics;
  const metricTrend = data?.metricTrend || [];
  const items = data?.items || [];
  const pending = data?.pendingReview ?? 0;
  const reviewed = data?.reviewed ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Read-only banner */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "10px",
          background: "#0a0a12",
          border: "1px solid #1a1a2a",
          fontSize: "12px",
          color: "#94a3b8",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: A, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>MONITORING</span>
        {" · "}
        Model accuracy is measured against the officers' consensus verdicts. Officers
        confirm or correct AI classifications in the Review Queue — this page reflects their work.
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {[
          { l: "ACCURACY",  v: metrics?.accuracy,  color: A },
          { l: "PRECISION", v: metrics?.precision, color: "#a855f7" },
          { l: "RECALL",    v: metrics?.recall,    color: "#22c55e" },
          { l: "F1 SCORE",  v: metrics?.f1,        color: "#f59e0b" },
        ].map((m) => {
          const numeric = m.v === null || m.v === undefined ? null : m.v * 100;
          const sampleSize = metrics?.sampleSize ?? 0;
          const subtext = sampleSize === 0
            ? "Awaiting officer reviews"
            : `${sampleSize} officer verdict${sampleSize === 1 ? "" : "s"}`;
          return (
            <div key={m.l} style={card}>
              <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.07em" }}>{m.l}</div>
              <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "12px", fontFamily: "'JetBrains Mono',monospace" }}>
                {numeric === null ? "—" : `${numeric.toFixed(1)}%`}
              </div>
              <div style={{ height: "4px", borderRadius: "999px", background: "#13131e", marginBottom: "6px" }}>
                <div style={{ height: "100%", borderRadius: "999px", width: `${numeric ?? 0}%`, background: m.color }} />
              </div>
              <div style={{ fontSize: "11px", color: "#4b5563" }}>
                Target: ≥85% · {subtext}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px" }}>
        {[
          { l: "AI-ANALYZED REPORTS", v: data?.analyzed ?? 0, c: A, sub: "In your agency" },
          { l: "AWAITING OFFICER", v: pending, c: "#f59e0b", sub: "No verdict yet" },
          { l: "OFFICER-VERIFIED", v: reviewed, c: "#22c55e", sub: "Verdict recorded" },
        ].map((s) => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.07em", marginBottom: "6px" }}>{s.l}</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: s.c, fontFamily: "'JetBrains Mono',monospace" }}>{s.v.toLocaleString()}</div>
            <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "4px" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Rolling accuracy */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Accuracy Over Time</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>
          Rolling metrics from officer verdicts as they are recorded
        </div>
        {metricTrend.length < 2 ? (
          <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#4b5563", fontSize: "12px", gap: "6px", textAlign: "center", padding: "0 20px" }}>
            <div>Not enough officer verdicts on different days yet.</div>
            <div style={{ fontSize: "11px", color: "#374151" }}>
              Officers record verdicts in the Review Queue. Once two or more verdicts exist on separate days, the trend line appears here.
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={metricTrend} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={A} stopOpacity={0.30} />
                  <stop offset="95%" stopColor={A} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="precGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#13131e" />
              <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Area type="monotone" dataKey="acc"    stroke={A}         strokeWidth={2.5} fill="url(#accGrad)"  activeDot={{ r: 4, fill: A_SOFT, stroke: "#0e0e18", strokeWidth: 2 }} />
              <Area type="monotone" dataKey="prec"   stroke="#a855f7"   strokeWidth={2}   fill="url(#precGrad)" activeDot={{ r: 3, fill: "#a855f7", stroke: "#0e0e18", strokeWidth: 2 }} />
              <Line type="monotone" dataKey="recall" stroke="#22c55e"   strokeWidth={2}   dot={false} strokeDasharray="5 4" />
              <Line type="monotone" dataKey="f1"     stroke="#f59e0b"   strokeWidth={2}   dot={false} strokeDasharray="2 4" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Read-only table — redesigned for readability */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>
          AI Classifications — Officer Review Status
        </div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>
          {pending} awaiting officer verdict · {reviewed} reviewed · {items.length} total AI-analyzed reports in your agency
        </div>
        {items.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
            No AI-analyzed reports in your agency yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "960px" }}>
              <thead>
                <tr>
                  {["REPORT", "NUMBER", "REGION", "AI TIER", "SUBTYPE", "CONF.", "OFFICER VERDICT", "AGREEMENT", "STATUS"].map((h) => (
                    <th key={h} style={thS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const conf = it.aiSubtypeConfidence ?? it.aiConfidence;
                  const confColor = conf === null || conf === undefined ? "#6b7280" : conf >= 0.9 ? "#22c55e" : conf >= 0.7 ? "#f59e0b" : "#ef4444";
                  const tier = TIER_STYLES[it.aiLabel] || TIER_STYLES.unavailable;
                  const riskColor = RISK_COLORS[it.riskLevel] || RISK_COLORS.UNKNOWN;
                  const statusColor = STATUS_COLORS[it.status] || "#6b7280";

                  // Agreement cell — muted, compact
                  let agreementContent;
                  if (it.agreementStatus === "confirmed") {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#cbd5e1" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                        Confirmed <span style={{ color: "#64748b", fontFamily: "'JetBrains Mono',monospace" }}>{it.officerAgreement}/3</span>
                      </span>
                    );
                  } else if (it.agreementStatus === "corrected") {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#cbd5e1" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
                        Corrected <span style={{ color: "#64748b", fontFamily: "'JetBrains Mono',monospace" }}>{it.officerAgreement}/3</span>
                      </span>
                    );
                  } else if (it.agreementStatus === "admin-reviewed") {
                    agreementContent = (
                      <span style={{ fontSize: "11px", color: "#64748b" }}>Legacy admin review</span>
                    );
                  } else {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94a3b8" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                        Awaiting officer
                      </span>
                    );
                  }

                  return (
                    <tr
                      key={it.id}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#101020"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {/* REPORT — monospace purple, truncated */}
                      <td style={{ ...tdS, color: A, fontFamily: "'JetBrains Mono',monospace", fontSize: "11px" }}>
                        {it.id?.slice(-8) || "—"}
                      </td>

                      {/* NUMBER — monospace white */}
                      <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>
                        {it.number || "—"}
                      </td>

                      {/* REGION — muted */}
                      <td style={{ ...tdS, color: "#64748b", fontSize: "11px" }}>
                        {it.region || "—"}
                      </td>

                      {/* AI TIER — compact pill */}
                      <td style={{ ...tdS }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 9px",
                            borderRadius: "5px",
                            fontSize: "10px",
                            fontWeight: 700,
                            fontFamily: "'JetBrains Mono',monospace",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            background: tier.bg,
                            border: `1px solid ${tier.border}`,
                            color: tier.text,
                          }}
                        >
                          {it.aiLabel || "unknown"}
                        </span>
                      </td>

                      {/* SUBTYPE — sentence case, comfortable */}
                      <td style={{ ...tdS, color: it.aiSubtype ? "#cbd5e1" : "#475569", fontSize: "12px" }}>
                        {labelSubtype(it.aiSubtype) || "—"}
                      </td>

                      {/* CONFIDENCE — color-coded, monospace */}
                      <td style={{ ...tdS, fontWeight: 600, color: confColor, fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>
                        {conf !== null && conf !== undefined ? `${(conf * 100).toFixed(1)}%` : "—"}
                      </td>

                      {/* OFFICER VERDICT — sentence case */}
                      <td style={{ ...tdS, color: it.officerVerdict ? "#cbd5e1" : "#475569", fontSize: "12px" }}>
                        {labelSubtype(it.officerVerdict) || "—"}
                      </td>

                      {/* AGREEMENT — muted dot + label + count */}
                      <td style={tdS}>{agreementContent}</td>

                      {/* STATUS — label + risk chip */}
                      <td style={tdS}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: statusColor }}>
                            {labelStatus(it.status)}
                          </span>
                          <span style={{ fontSize: "10px", color: riskColor, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.04em" }}>
                            {it.riskLevel}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}