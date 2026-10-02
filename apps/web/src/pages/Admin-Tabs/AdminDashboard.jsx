// apps/web/src/pages/Admin-Tabs/AdminDashboard.jsx
import { useEffect, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import apiClient from "../../lib/api";

const A = "#f97316"; // admin accent

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// Human-friendly labels for AI subtypes.
const SUBTYPE_LABELS = {
  personal_conversational: "Personal Conversation",
  two_factor_auth: "One-Time Password",
  appointment_reminder: "Appointment Reminder",
  delivery_tracking: "Delivery Tracking",
  bank_activity_alert: "Bank Activity Alert",
  brand_marketing: "Brand Marketing",
  phishing_link: "Phishing Link",
  fake_prize_lottery: "Fake Prize / Lottery",
  wrong_number_baiting: "Wrong-Number Baiting",
  urgent_fine_toll: "Urgent Fine / Toll",
  impersonation_family: "Impersonation (Family)",
};

function labelSubtype(subtype) {
  if (!subtype) return null;
  return SUBTYPE_LABELS[subtype] || subtype;
}

// Tier → color mapping for the AI TIER pill.
const TIER_STYLES = {
  malicious: { bg: "rgba(244,63,94,0.10)", border: "rgba(244,63,94,0.35)", text: "#fb7185" },
  grey_area: { bg: "rgba(234,179,8,0.10)", border: "rgba(234,179,8,0.35)", text: "#facc15" },
  legitimate: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", text: "#34d399" },
  uncertain: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.35)", text: "#94a3b8" },
  unavailable: { bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.2)", text: "#64748b" },
};

const RISK_STYLES = {
  HIGH: "#f43f5e",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
  UNKNOWN: "#6b7280",
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: res } = await apiClient.get("/api/v1/admin/dashboard");
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
              "Could not load agency dashboard."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>
        Loading agency dashboard…
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

  const kpis = data?.kpis || {};
  const trend = data?.trend || [];
  const heatmap = (data?.heatmap || []).map((row) => ({ region: row.region, v: row.reports }));
  const patterns = data?.patterns || [];
  const flagged = data?.flagged || [];
  const modelMetrics = data?.modelMetrics;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Scope banner */}
      <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#0a0a12", border: "1px solid #1a1a2a", fontSize: "12px", color: "#94a3b8" }}>
        <span style={{ color: A, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>SCOPE</span>
        {" · "}
        {data?.scope?.agency || "—"}
        {" · "}
        {data?.scope?.jurisdiction || "—"}
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {[
          { l: "TOTAL REPORTS",     v: (kpis.totalReports ?? 0).toLocaleString(), sc: "#22c55e", sub: "All time · agency scope" },
          { l: "AI MODEL ACCURACY", v: kpis.aiModelAccuracy !== null && kpis.aiModelAccuracy !== undefined ? `${(kpis.aiModelAccuracy * 100).toFixed(1)}%` : "—", sc: "#22c55e", sub: modelMetrics ? `${modelMetrics.sampleSize} reviewed` : "No reviews yet" },
          { l: "OPEN REPORTS",      v: (kpis.openReports ?? 0).toLocaleString(), sc: "#f59e0b", sub: "Pending · under review" },
          { l: "ACTIVE OFFICERS",   v: (kpis.activeOfficers ?? 0).toLocaleString(), sc: "#a855f7", sub: "All regions" },
        ].map((s) => (
          <div key={s.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.07em" }}>{s.l}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "4px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
            <div style={{ fontSize: "11px", color: s.sc }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>7-Day Report Trend</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Daily incoming reports, agency scope</div>
          {trend.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#4b5563", fontSize: "12px" }}>
              No reports in the last 7 days.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="adminTrendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={A} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={A} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="sms" stroke={A} strokeWidth={2} fill="url(#adminTrendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Regional Distribution</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Reports per region, agency scope</div>
          {heatmap.length === 0 ? (
            <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "#4b5563", fontSize: "12px" }}>
              No regional data yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={heatmap} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="region" type="category" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
                <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                  {heatmap.map((_, i) => <Cell key={i} fill={`rgba(249,115,22,${0.9 - i * 0.15})`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Patterns + AI Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "16px" }}>
        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Top Scam Types</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Ranked by report volume · AI subtype or officer-verified label</div>
          {patterns.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No categories yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["#","CATEGORY","REPORTS"].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {patterns.map((p, idx) => (
                  <tr key={p.category}>
                    <td style={{ ...tdS, color: "#374151" }}>{idx + 1}</td>
                    <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>
                      {labelSubtype(p.category) || p.category}
                    </td>
                    <td style={{ ...tdS, fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{p.reports.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={card}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>AI Detector Metrics</div>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Computed from agency's review feedback</div>
          {!modelMetrics ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>
              No AI reviews submitted yet.
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{ fontSize: "40px", fontWeight: 800, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>
                  {fmtPct(modelMetrics.accuracy)}
                </div>
                <span style={{ display: "inline-block", marginTop: "8px", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#14412a", color: "#22c55e" }}>
                  ● {modelMetrics.sampleSize} reviews
                </span>
              </div>
              {[
                { l: "Precision", v: fmtPct(modelMetrics.precision), c: "#3b82f6" },
                { l: "Recall",    v: fmtPct(modelMetrics.recall),    c: "#22c55e" },
                { l: "F1 Score",  v: fmtPct(modelMetrics.f1),        c: "#f59e0b" },
              ].map((m) => (
                <div key={m.l} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
                  <span style={{ color: "#6b7280" }}>{m.l}</span>
                  <span style={{ fontWeight: 600, color: m.c, fontFamily: "'JetBrains Mono',monospace" }}>{m.v}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* AI-Flagged — every AI-classified report not yet finalized */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>
          AI Classification — Awaiting Officer Review
        </div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>
          Reports the AI has classified across your agency. Officers confirm or correct the subtype during review — once 2-of-3 officers agree, the report is finalized and drops off this list.
        </div>

        {flagged.length === 0 ? (
          <div
            style={{
              padding: "24px 20px",
              textAlign: "center",
              borderRadius: "10px",
              background: "#080810",
              border: "1px solid #13131e",
            }}
          >
            <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "4px", fontWeight: 500 }}>
              No AI-classified reports awaiting review.
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: 1.5 }}>
              Reports submitted with a screenshot appear here once the AI finishes analyzing them.
              Once officers reach 2-of-3 consensus, the report is finalized and drops off this list.
            </div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["REPORT ID", "NUMBER", "AI TIER", "SUBTYPE", "CONFIDENCE", "RISK", "REVIEW"].map((h) => (
                  <th key={h} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flagged.map((f) => {
                const tier = TIER_STYLES[f.label] || TIER_STYLES.unavailable;
                const conf = f.subtypeConfidence ?? f.confidence;
                const confColor =
                  conf === null || conf === undefined
                    ? "#6b7280"
                    : conf >= 0.85
                    ? "#22c55e"
                    : conf >= 0.6
                    ? "#f59e0b"
                    : "#ef4444";
                const riskColor = RISK_STYLES[f.riskLevel] || RISK_STYLES.UNKNOWN;

                return (
                  <tr key={f.id}>
                    <td style={{ ...tdS, color: A, fontFamily: "'JetBrains Mono',monospace" }}>
                      {f.id?.slice(-8) || "—"}
                    </td>
                    <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>
                      {f.number || "—"}
                    </td>
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
                        {f.label || "unknown"}
                      </span>
                    </td>
                    <td style={{ ...tdS, color: f.subtype ? "#cbd5e1" : "#374151", fontSize: "11px" }}>
                      {labelSubtype(f.subtype) || "—"}
                    </td>
                    <td
                      style={{
                        ...tdS,
                        fontWeight: 600,
                        color: confColor,
                        fontFamily: "'JetBrains Mono',monospace",
                      }}
                    >
                      {conf !== null && conf !== undefined
                        ? `${(conf * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td style={{ ...tdS }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: riskColor,
                          fontFamily: "'JetBrains Mono',monospace",
                        }}
                      >
                        {f.riskLevel || "UNKNOWN"}
                      </span>
                    </td>
                    <td style={{ ...tdS }}>
                      {f.reviewed ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#22c55e" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                          Reviewed
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#f59e0b" }}>
                          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
                          Awaiting
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}