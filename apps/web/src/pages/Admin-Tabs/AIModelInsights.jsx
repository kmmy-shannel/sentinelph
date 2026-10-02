// apps/web/src/pages/Admin-Tabs/AIModelInsights.jsx
import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import apiClient from "../../lib/api";

const A = "#f97316";

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
  malicious: { bg: "rgba(244,63,94,0.10)", border: "rgba(244,63,94,0.35)", text: "#fb7185" },
  grey_area: { bg: "rgba(234,179,8,0.10)", border: "rgba(234,179,8,0.35)", text: "#facc15" },
  legitimate: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", text: "#34d399" },
  uncertain: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.35)", text: "#94a3b8" },
  unavailable: { bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", text: "#64748b" },
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
const thS = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

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
          { l: "ACCURACY",  v: metrics?.accuracy,  color: "#3b82f6" },
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
          { l: "AI-ANALYZED REPORTS", v: data?.analyzed ?? 0, c: "#3b82f6", sub: "In your agency" },
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
            <LineChart data={metricTrend} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#13131e" />
              <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[50, 100]} tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
              <Line type="monotone" dataKey="acc"    stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="prec"   stroke="#a855f7" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="recall" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="f1"     stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Read-only table */}
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
              <thead>
                <tr>
                  {["REPORT ID", "NUMBER", "REGION", "AI TIER", "AI SUBTYPE", "CONFIDENCE", "OFFICER VERDICT", "AGREEMENT", "STATUS"].map((h) => (
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

                  // Agreement cell
                  let agreementContent;
                  if (it.agreementStatus === "confirmed") {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#22c55e" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e" }} />
                        Confirmed ({it.officerAgreement}/3)
                      </span>
                    );
                  } else if (it.agreementStatus === "corrected") {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#3b82f6" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                        Corrected ({it.officerAgreement}/3)
                      </span>
                    );
                  } else if (it.agreementStatus === "admin-reviewed") {
                    agreementContent = (
                      <span style={{ fontSize: "11px", color: "#94a3b8" }}>Legacy admin review</span>
                    );
                  } else {
                    agreementContent = (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#f59e0b" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b" }} />
                        Awaiting officer
                      </span>
                    );
                  }

                  return (
                    <tr key={it.id}>
                      <td style={{ ...tdS, color: A, fontFamily: "'JetBrains Mono',monospace" }}>{it.id?.slice(-8)}</td>
                      <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{it.number || "—"}</td>
                      <td style={{ ...tdS, color: "#6b7280" }}>{it.region || "—"}</td>
                      <td style={{ ...tdS }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
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
                      <td style={{ ...tdS, color: it.aiSubtype ? "#cbd5e1" : "#374151", fontSize: "11px" }}>
                        {labelSubtype(it.aiSubtype) || "—"}
                      </td>
                      <td style={{ ...tdS, fontWeight: 600, color: confColor, fontFamily: "'JetBrains Mono',monospace" }}>
                        {conf !== null && conf !== undefined ? `${(conf * 100).toFixed(1)}%` : "—"}
                      </td>
                      <td style={{ ...tdS, color: it.officerVerdict ? "#cbd5e1" : "#374151", fontSize: "11px" }}>
                        {labelSubtype(it.officerVerdict) || "—"}
                      </td>
                      <td style={tdS}>{agreementContent}</td>
                      <td style={tdS}>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor }}>
                          {labelStatus(it.status)}
                        </span>
                        <span style={{ marginLeft: "6px", fontSize: "10px", color: riskColor, fontFamily: "'JetBrains Mono',monospace" }}>
                          {it.riskLevel}
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
    </div>
  );
}