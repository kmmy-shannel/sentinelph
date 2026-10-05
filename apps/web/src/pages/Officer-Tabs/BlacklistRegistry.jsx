// apps/web/src/pages/Officer-Tabs/BlacklistRegistry.jsx
import { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

// ─── Tier styling — same palette as the review queue ─────────────────
const TIER_STYLES = {
  malicious:   { dot: "#f43f5e", text: "#fb7185", bg: "rgba(244,63,94,0.06)",   border: "rgba(244,63,94,0.25)",   label: "Malicious" },
  grey_area:   { dot: "#eab308", text: "#facc15", bg: "rgba(234,179,8,0.06)",   border: "rgba(234,179,8,0.25)",   label: "Grey Area" },
  legitimate:  { dot: "#10b981", text: "#34d399", bg: "rgba(16,185,129,0.06)",  border: "rgba(16,185,129,0.25)",  label: "Legitimate" },
  uncertain:   { dot: "#94a3b8", text: "#94a3b8", bg: "rgba(148,163,184,0.06)", border: "rgba(148,163,184,0.20)", label: "Uncertain" },
  unavailable: { dot: "#64748b", text: "#64748b", bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.20)", label: "Unavailable" },
};

function normalizeTierKey(raw) {
  if (!raw) return 'unavailable';
  const s = String(raw).toLowerCase().trim();
  if (s === 'malicious') return 'malicious';
  if (s === 'grey_area' || s === 'grey area' || s === 'greyarea' || s === 'gray_area' || s === 'gray area') return 'grey_area';
  if (s === 'legitimate') return 'legitimate';
  if (s === 'uncertain') return 'uncertain';
  return 'unavailable';
}

// ─── Subtype display labels — mirrors inference.py's taxonomy ────────
const SUBTYPE_LABELS = {
  personal_conversational: "Personal Conversation",
  two_factor_auth:         "One-Time Password (OTP)",
  appointment_reminder:    "Appointment Reminder",
  delivery_tracking:       "Delivery Tracking",
  bank_activity_alert:     "Bank Activity Alert",
  brand_marketing:         "Brand Marketing",
  phishing_link:           "Phishing Link (Smishing)",
  fake_prize_lottery:      "Fake Prize / Lottery",
  wrong_number_baiting:    "Wrong-Number Baiting",
  urgent_fine_toll:        "Urgent Fine / Toll",
  impersonation_family:    "Impersonation (Family)",
};

function labelSubtype(st) {
  if (!st) return "—";
  return SUBTYPE_LABELS[st] || st;
}

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
    <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const CloseIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const EyeIcon = ({ color = "#60a5fa", size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ACTION_BTN_VIEW = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "5px 11px",
  borderRadius: "7px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
  background: "rgba(59,130,246,0.10)",
  border: "1px solid rgba(59,130,246,0.35)",
  color: "#60a5fa",
  transition: "background 0.12s ease",
  whiteSpace: "nowrap",
  fontFamily: "'Inter', system-ui, sans-serif",
};

function formatTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function mapEntryToRow(e) {
  const votes = Array.isArray(e.votes) ? e.votes : [];
  const approvingOfficers = votes
    .filter(v => v.decision === 'approve')
    .map(v => (v.officerId || v.userId || '').slice(-6) || '—')
    .join(' · ') || '—';
  const decisionDate = e.blacklistedAt || e.updatedAt
    ? formatTimestamp(e.blacklistedAt || e.updatedAt)
    : "—";
  return {
    id: e._id ? String(e._id).slice(-6).toUpperCase() : "—",
    number: e.phoneNumber || "—",
    aiTier: normalizeTierKey(e.aiLabel),
    aiLabel: normalizeTierKey(e.aiLabel),
    aiRawLabel: e.aiLabel || null,
    aiSubtype: e.aiSubtype || null,
    aiRiskLevel: e.aiRiskLevel || null,
    aiConfidence: typeof e.aiConfidence === "number" ? e.aiConfidence : null,
    reports: e.reportCount ?? 0,
    status: 'Blocked',
    rawStatus: e.status,
    officers: approvingOfficers,
    date: decisionDate,
    hash: e.hash || '—',
    notes: e.notes || null,
    votes,
    evidenceImage: e.evidenceImage || null,
  };
}

export default function BlacklistRegistry() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [showExportSuccess, setShowExportSuccess] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/v1/blacklist', { params: { limit: 100 } });
      setEntries((data.data ?? []).map(mapEntryToRow));
    } catch (err) {
      console.error('[BlacklistRegistry] fetch failed:', err);
      setError(err?.response?.data?.message || 'Failed to load blacklist registry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (window.__clearSidebarBadge) {
      window.__clearSidebarBadge('registry');
    }

    loadEntries();

    apiClient.post('/api/v1/stats/seen/blacklist')
      .then(() => window.dispatchEvent(new CustomEvent('badges:refresh')))
      .catch(() => window.dispatchEvent(new CustomEvent('badges:refresh')));
  }, [loadEntries]);

  const filtered = entries.filter((e) => {
    const matchFilter = filter === "all" || e.status.toLowerCase() === filter;
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      e.number.includes(search) ||
      e.id.toLowerCase().includes(q) ||
      (e.aiLabel || "").toLowerCase().includes(q) ||
      (e.aiSubtype || "").toLowerCase().includes(q) ||
      labelSubtype(e.aiSubtype).toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  function handleExportCSV() {
    const headers = [
      "Block ID", "Number", "AI Tier", "Subtype", "Risk", "Confidence",
      "Reports", "Status", "Approving Officers", "Decision Date", "Hash",
    ];
    const rows = filtered.map(e => [
      e.id,
      e.number,
      e.aiLabel || "",
      e.aiSubtype || "",
      e.aiRiskLevel || "",
      e.aiConfidence != null ? e.aiConfidence.toFixed(4) : "",
      e.reports,
      e.status,
      e.officers,
      e.date,
      e.hash,
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinelph-blacklist-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportSuccess(true);
    setTimeout(() => setShowExportSuccess(false), 3000);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "280px" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, tier, subtype, ID…"
            style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {["all", "blocked"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                background: filter === f ? "#1a1a2a" : "transparent",
                border: "1px solid #1a1a2a",
                color: filter === f ? "#e2e8f0" : "#4b5563",
                textTransform: "capitalize",
              }}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportCSV}
          style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#6b7280" }}
        >
          Export CSV
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {showExportSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          CSV exported successfully. Check your downloads folder.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Blacklist Registry</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>
            {loading ? "Loading…" : `${filtered.length} entries · Click "View" for details`}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["BLOCK ID", "NUMBER", "AI TIER", "SUBTYPE", "REPORTS", "STATUS", "APPROVING OFFICERS", "DECISION DATE", "ACTION"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: "12px 20px",
                    textAlign: i === 8 ? "center" : "left",
                    fontSize: "9px",
                    fontWeight: 500,
                    color: "#4b5563",
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: "0.06em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading registry…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No entries in this view.</td></tr>}
            {!loading && filtered.map((row) => {
              const tier = TIER_STYLES[row.aiTier] || TIER_STYLES.unavailable;
              return (
                <tr
                  key={row.number}
                  style={{ borderBottom: "1px solid #13131e" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "3px 9px",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        fontFamily: "'JetBrains Mono',monospace",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        color: tier.text,
                        background: tier.bg,
                        border: `1px solid ${tier.border}`,
                      }}
                    >
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: tier.dot, display: "inline-block" }} />
                      {tier.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: row.aiSubtype ? "#cbd5e1" : "#4b5563" }}>
                    {labelSubtype(row.aiSubtype)}
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#ef4444" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
                      Blocked
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.officers}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{row.date}</td>
                  <td style={{ padding: "12px 20px", verticalAlign: "middle", textAlign: "center" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedCase(row); }}
                      style={ACTION_BTN_VIEW}
                      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.22)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.10)"}
                    >
                      <EyeIcon color="#60a5fa" size={11} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedCase && (() => {
        const tier = TIER_STYLES[selectedCase.aiTier] || TIER_STYLES.unavailable;
        return (
          <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: "20px" }}>
            <div style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", borderRadius: "20px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#ef4444,transparent)" }} />

              <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid #13131e" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>{selectedCase.id}</div>
                    <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{selectedCase.number}</div>
                  </div>
                  <button onClick={() => setSelectedCase(null)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                    <CloseIcon color="#4b5563" />
                  </button>
                </div>
                <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: "#ef444420", color: "#ef4444" }}>
                  Blocked
                </div>
              </div>

              <div style={{ padding: "20px 28px 24px", overflowY: "auto" }}>
                {/* AI Classification panel */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", marginBottom: "8px" }}>
                    AI CLASSIFICATION
                  </div>
                  <div style={{ padding: "14px 16px", borderRadius: "10px", background: tier.bg, border: `1px solid ${tier.border}` }}>
                    <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
                      <div style={{ flex: "0 0 auto", minWidth: "110px" }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>TIER</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: tier.dot }} />
                          <span style={{ fontSize: "12px", fontWeight: 700, color: tier.text, fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>
                            {tier.label}
                          </span>
                        </div>
                        {selectedCase.aiRiskLevel && (
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                            Risk: {selectedCase.aiRiskLevel}
                          </div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>SUBTYPE</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px", wordBreak: "break-word" }}>
                          {labelSubtype(selectedCase.aiSubtype)}
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b" }}>
                          {selectedCase.aiConfidence != null
                            ? `${(selectedCase.aiConfidence * 100).toFixed(1)}% confidence`
                            : "confidence unavailable"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: "20px" }}>
                  {[
                    { l: "TOTAL REPORTS",      v: selectedCase.reports },
                    { l: "APPROVING OFFICERS", v: selectedCase.officers },
                    { l: "DECISION DATE",      v: selectedCase.date, mono: true },
                  ].map(f => (
                    <div key={f.l}>
                      <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{f.l}</div>
                      <div style={{ fontSize: "13px", color: "#fff", fontFamily: f.mono ? "'JetBrains Mono',monospace" : "inherit" }}>{f.v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
                  <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>BLOCK HASH</div>
                  <div style={{ fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace", wordBreak: "break-all" }}>{selectedCase.hash}</div>
                </div>

                {selectedCase.evidenceImage && (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", marginBottom: "8px" }}>SCREENSHOT EVIDENCE</div>
                    <div style={{ borderRadius: "10px", overflow: "hidden", background: "#080810", border: "1px solid #13131e", display: "flex", justifyContent: "center", maxHeight: "320px" }}>
                      <img src={selectedCase.evidenceImage} alt="Scam evidence" style={{ maxWidth: "100%", maxHeight: "320px", objectFit: "contain" }} />
                    </div>
                  </div>
                )}

                {selectedCase.votes.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", marginBottom: "8px" }}>
                      OFFICER REASONING ({selectedCase.votes.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {selectedCase.votes.map((v, i) => (
                        <div key={i} style={{ padding: "10px 14px", borderRadius: "8px", background: "#080810", border: `1px solid ${v.decision === 'approve' ? '#22c55e30' : '#ef444430'}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>
                              Officer #{i + 1} · {(v.officerId || v.userId || '').slice(-6) || '—'}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: v.decision === 'approve' ? '#22c55e' : '#ef4444' }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: v.decision === 'approve' ? '#22c55e' : '#ef4444' }} />
                              {v.decision === 'approve' ? 'Approved' : 'Rejected'}
                            </span>
                          </div>
                          <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.6 }}>
                            "{v.comment || 'No comment'}"
                          </div>
                          <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                            {formatTimestamp(v.votedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedCase.votes.length === 0 && (
                  <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", background: "#080810", border: "1px solid #13131e" }}>
                    <div style={{ fontSize: "9px", fontWeight: 500, marginBottom: "6px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>OFFICER NOTES</div>
                    <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.7 }}>
                      {selectedCase.notes || "No officer notes recorded."}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ padding: "16px 28px 24px", borderTop: "1px solid #13131e" }}>
                <button
                  onClick={() => setSelectedCase(null)}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: "#1a1a2a", color: "#fff", cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}