import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiClient, { fetchReports, submitReportVote } from "../../lib/api";

// ─── Status buckets ─────────────────────────────────────────
const UNRESOLVED = ['pending', 'under_review', 'one_approval'];

// ─── Pagination ─────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
const POLL_INTERVAL_MS = 15000;

const CheckIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CloseIcon = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function formatTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapReportToRow(r) {
  const id = r.reportId || r.id || r._id;
  const ai = r.aiFlag || {};
  const approvals = r.consensusState?.approvals ?? 0;
  const rejections = r.consensusState?.rejections ?? 0;
  const totalVotes = approvals + rejections;

  const rawStatus = (r.status || "pending").toLowerCase();
  const displayStatus =
    rawStatus === "pending"      ? "Pending" :
    rawStatus === "under_review" ? "Under Review" :
    rawStatus === "one_approval" ? "1 Approval" :
    rawStatus === "approved" || rawStatus === "blacklisted" ? "Blacklisted" :
    rawStatus === "rejected"     ? "Rejected" :
    rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  return {
    id: String(id),
    number: r.sender || r.scammerNumber || r.reportedNumber || "Unknown",
    type: r.scamType || r.category || "UNKNOWN",
    reports: r.reportCount ?? r.reports ?? 1,
    channel: r.channel || "SMS",
    submitted: formatTimestamp(r.createdAt || r.submittedAt),
    priorVotes: totalVotes === 0 ? "None" : totalVotes === 1 ? "1 vote" : `${totalVotes} votes`,
    status: displayStatus,
    rawStatus,
    isUnresolved: UNRESOLVED.includes(rawStatus),
    evidenceText: r.evidenceText || r.content || r.textData || "",
    evidenceImage: r.evidenceImage || null,
    hasEvidenceImage: Boolean(r.hasEvidenceImage || r.evidenceImage),
    evidenceFiles: Array.isArray(r.evidenceFiles) ? r.evidenceFiles : [],
    aiLabel: ai.label || "unavailable",
    aiRiskLevel: ai.riskLevel || "UNKNOWN",
    aiConfidence: typeof ai.confidenceScore === "number" ? ai.confidenceScore : null,
    nullifierHash: r.nullifierHash || r.nullifier || null,
    zkpHash: r.zkpHash || null,
    jurisdiction: r.jurisdiction || "PH",
  };
}

// The API mixes two error envelopes: { error: { code, message } } (ApiError)
// and { error: "CODE", message } (rbac / rate limiters). Handle both so an
// error object never renders as "[object Object]".
function extractErrorMessage(err, fallback) {
  const data = err?.response?.data;
  const nested = data?.error && typeof data.error === "object" ? data.error.message : null;
  const flat = typeof data?.error === "string" ? data.error : null;
  return nested || data?.message || flat || err?.message || fallback;
}

export default function ReviewQueue() {
  const [tab, setTab] = useState("pending");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  const [reports, setReports] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasMore: false });
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, all: 0 });
  // false when the backend still returns the legacy un-paginated array;
  // the tab filter is then applied client-side so the queue keeps working.
  const [serverPaginated, setServerPaginated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [voteModal, setVoteModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [successMessage, setSuccessMessage] = useState(null);
  const [submittingVote, setSubmittingVote] = useState(false);

  // Sequence guards: only the newest list / detail request may write state,
  // so a slow earlier response can never overwrite a fresher one.
  const listSeqRef = useRef(0);
  const detailSeqRef = useRef(0);

  const loadReports = useCallback(async ({ silent = false } = {}) => {
    const seq = ++listSeqRef.current;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const data = await fetchReports({ page, limit, bucket: tab });
      if (seq !== listSeqRef.current) return;

      const isLegacyArray = Array.isArray(data);
      const list = isLegacyArray ? data : data?.reports || data?.data || [];
      const rows = list.map(mapReportToRow);
      const serverPagination = isLegacyArray ? null : data?.pagination;
      const serverCounts = isLegacyArray ? null : data?.counts;

      // The last item on the last page was just resolved: step back a page.
      if (serverPagination && serverPagination.totalPages >= 1 && page > serverPagination.totalPages) {
        setPage(serverPagination.totalPages);
        return;
      }

      setServerPaginated(Boolean(serverPagination));
      setReports(rows);
      setPagination(
        serverPagination
          ? {
              total: serverPagination.total ?? rows.length,
              totalPages: serverPagination.totalPages ?? 1,
              hasMore: Boolean(serverPagination.hasMore),
            }
          : { total: rows.length, totalPages: 1, hasMore: false }
      );
      setCounts(
        serverCounts
          ? {
              pending: serverCounts.pending ?? 0,
              resolved: serverCounts.resolved ?? 0,
              all: serverCounts.all ?? rows.length,
            }
          : {
              pending: rows.filter((r) => r.isUnresolved).length,
              resolved: rows.filter((r) => !r.isUnresolved).length,
              all: rows.length,
            }
      );
    } catch (err) {
      if (seq !== listSeqRef.current) return;
      setError(extractErrorMessage(err, "Failed to load review queue."));
      setReports([]);
    } finally {
      if (seq === listSeqRef.current) setLoading(false);
    }
  }, [page, limit, tab]);

  useEffect(() => {
    loadReports();
    const interval = setInterval(() => loadReports({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadReports]);

  const visibleRows = useMemo(() => {
    if (serverPaginated) return reports;
    if (tab === "pending")  return reports.filter((r) => r.isUnresolved);
    if (tab === "resolved") return reports.filter((r) => !r.isUnresolved);
    return reports;
  }, [reports, tab, serverPaginated]);

  const pendingCount  = counts.pending;
  const resolvedCount = counts.resolved;
  const allCount      = counts.all;

  const totalItems = serverPaginated ? pagination.total : visibleRows.length;
  const totalPages = serverPaginated ? pagination.totalPages : 1;
  const rangeFrom = totalItems === 0 ? 0 : serverPaginated ? (page - 1) * limit + 1 : 1;
  const rangeTo = serverPaginated ? Math.min(page * limit, totalItems) : totalItems;

  function changeTab(nextTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    setPage(1);
  }

  function changePageSize(nextLimit) {
    setLimit(nextLimit);
    setPage(1);
  }

  function closeModal() {
    detailSeqRef.current += 1; // cancel any in-flight detail fetch
    setDetailLoading(false);
    setVoteModal(null);
    setDecision(null);
    setComment("");
  }

  // The list intentionally omits the (large) base64 screenshot; fetch it
  // for the one case the officer opened.
  async function openVoteModal(row) {
    setVoteModal(row);
    setDecision(null);
    setComment("");

    if (!row.hasEvidenceImage || row.evidenceImage) return;

    const seq = ++detailSeqRef.current;
    setDetailLoading(true);
    try {
      const { data } = await apiClient.get(`/api/v1/reports/${encodeURIComponent(row.id)}`);
      if (seq !== detailSeqRef.current) return;

      const full = data?.report || data?.data || null;
      if (full?.evidenceImage) {
        setVoteModal((prev) =>
          prev && prev.id === row.id ? { ...prev, evidenceImage: full.evidenceImage } : prev
        );
      }
    } catch (err) {
      console.warn("[ReviewQueue] could not load screenshot evidence:", err?.message);
    } finally {
      if (seq === detailSeqRef.current) setDetailLoading(false);
    }
  }

  async function handleSubmitVote() {
    if (!decision || !comment.trim() || !voteModal) return;
    setSubmittingVote(true);
    try {
      const result = await submitReportVote(voteModal.id, { decision, comment: comment.trim() });

      closeModal();
      setSuccessMessage(
        result?.blacklisted
          ? "Vote submitted. Two-officer consensus reached — the number was added to the Blacklist Registry."
          : "Vote submitted successfully."
      );
      setTimeout(() => setSuccessMessage(null), 4000);

      // The server owns status/consensus — reload instead of guessing.
      loadReports({ silent: true });
    } catch (err) {
      alert(extractErrorMessage(err, "Failed to submit vote."));
    } finally {
      setSubmittingVote(false);
    }
  }

  const canPrev = page > 1 && !loading;
  const canNext = serverPaginated && page < totalPages && !loading;

  return (
    <div>
      <div style={{
        marginBottom: "16px", padding: "10px 14px", borderRadius: "10px",
        background: "#0e0e18", border: "1px solid #1a1a2a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
          <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 600, letterSpacing: "0.5px" }}>
            REGION-SCOPED QUEUE
          </span>
        </div>
        <span style={{ fontSize: "11px", color: "#4b5563" }}>
          Showing only your region's pending reports
        </span>
      </div>

      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", alignItems: "center" }}>
        {[
          { id: "all",      label: "All",      count: allCount },
          { id: "pending",  label: "Pending",  count: pendingCount },
          { id: "resolved", label: "Resolved", count: resolvedCount },
        ].map((t) => (
          <button key={t.id} onClick={() => changeTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "12px", fontWeight: 500, background: "none", border: "none", cursor: "pointer", borderBottom: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent", color: tab === t.id ? "#3b82f6" : "#4b5563" }}>
            {t.label}
            {t.count > 0 && <span style={{ padding: "1px 6px", borderRadius: "999px", fontSize: "9px", fontWeight: 700, background: "#ef4444", color: "#fff" }}>{t.count}</span>}
          </button>
        ))}
        <button
          onClick={() => loadReports()}
          disabled={loading}
          style={{ marginLeft: "auto", padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: loading ? "#374151" : "#9ca3af", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#1a0a0a", border: "1px solid #ef444440", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <CheckIcon color="#22c55e" />
          {successMessage}
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Incoming Reports</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Click "Vote →" to review a case</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["REPORT ID","NUMBER","SCAM TYPE","REPORTS","CHANNEL","SUBMITTED","PRIOR VOTES","STATUS",""].map((h) => (
                <th key={h} style={{ padding: "12px 20px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
                  {loading ? "Loading reports…" : "No reports in this view."}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #13131e" }}>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id.slice(0, 12)}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af" }}>{row.type}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.channel}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{row.submitted}</td>
                  <td style={{ padding: "12px 20px", fontSize: "12px", color: row.priorVotes === "1 vote" ? "#f59e0b" : "#4b5563" }}>{row.priorVotes}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: row.isUnresolved ? "#f59e0b" : "#22c55e" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: row.isUnresolved ? "#f59e0b" : "#22c55e", display: "inline-block" }} />
                      {row.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px" }}>
                    {row.isUnresolved ? (
                      <button onClick={() => openVoteModal(row)}
                        style={{ fontSize: "11px", fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        Vote →
                      </button>
                    ) : (
                      <span style={{ fontSize: "11px", color: "#374151" }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", padding: "12px 20px", borderTop: "1px solid #1a1a2a" }}>
          <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
            {totalItems === 0 ? "0 reports" : `${rangeFrom}–${rangeTo} of ${totalItems}`}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {serverPaginated && (
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#4b5563" }}>
                Per page
                <select
                  value={limit}
                  onChange={(e) => changePageSize(Number(e.target.value))}
                  style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "6px", background: "#080810", border: "1px solid #1a1a28", color: "#9ca3af", outline: "none" }}
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev}
                style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: canPrev ? "#9ca3af" : "#374151", cursor: canPrev ? "pointer" : "not-allowed" }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext}
                style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: canNext ? "#9ca3af" : "#374151", cursor: canNext ? "pointer" : "not-allowed" }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>

      {voteModal && (
        <div
          style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={closeModal}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              maxHeight: "90vh",
              margin: "0 16px",
              borderRadius: "20px",
              position: "relative",
              background: "#0e0e18",
              border: "1px solid #1a1a2a",
              boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top gradient line */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#3b82f6,transparent)", zIndex: 1 }} />

            {/* Sticky header with title + close button */}
            <div style={{
              position: "sticky",
              top: 0,
              zIndex: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              padding: "28px 28px 16px",
              background: "#0e0e18",
              borderBottom: "1px solid #13131e",
            }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>{voteModal.id.slice(0, 12)}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{voteModal.type} · {voteModal.channel} · {voteModal.reports} reports</div>
              </div>
              <button
                onClick={closeModal}
                aria-label="Close"
                style={{
                  color: "#4b5563",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  borderRadius: "6px",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#ef444415"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#4b5563"; e.currentTarget.style.background = "transparent"; }}
              >
                <CloseIcon color="currentColor" size={18} />
              </button>
            </div>

            {/* Scrollable content */}
            <div style={{ padding: "20px 28px 28px", overflowY: "auto" }}>
              <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{voteModal.number}</div>
                <div style={{ fontSize: "11px", color: "#4b5563" }}>Prior votes: {voteModal.priorVotes} · Submitted {voteModal.submitted}</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: "#1e3a5f", color: "#60a5fa" }}>AI: {voteModal.aiLabel}</span>
                  {voteModal.aiConfidence != null && (
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: "#1a1a28", color: "#6b7280" }}>Confidence: {(voteModal.aiConfidence * 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>

              {voteModal.evidenceImage ? (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>
                    SCREENSHOT EVIDENCE
                  </div>
                  <div style={{ borderRadius: "8px", overflow: "hidden", background: "#080810", border: "1px solid #13131e", maxHeight: "260px", display: "flex", justifyContent: "center" }}>
                    <img src={voteModal.evidenceImage} alt="Reported screenshot" style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain" }} />
                  </div>
                </div>
              ) : voteModal.hasEvidenceImage ? (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>
                    SCREENSHOT EVIDENCE
                  </div>
                  <div style={{ padding: "24px 12px", borderRadius: "8px", textAlign: "center", fontSize: "11px", background: "#080810", border: "1px solid #13131e", color: "#4b5563" }}>
                    {detailLoading ? "Loading screenshot…" : "Screenshot could not be loaded."}
                  </div>
                </div>
              ) : null}

              {voteModal.evidenceText && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>
                    EXTRACTED TEXT
                  </div>
                  <div style={{ padding: "12px", borderRadius: "8px", fontSize: "12px", lineHeight: 1.5, background: "#080810", border: "1px solid #13131e", color: "#cbd5e1", whiteSpace: "pre-wrap", maxHeight: "160px", overflowY: "auto", fontFamily: "'JetBrains Mono', monospace" }}>
                    {voteModal.evidenceText}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
                <button onClick={() => setDecision("approve")}
                  style={{ flex: 1, padding: "10px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer", background: decision === "approve" ? "#14412a" : "#111118", border: `1.5px solid ${decision === "approve" ? "#22c55e" : "#1a1a28"}`, color: decision === "approve" ? "#22c55e" : "#4b5563", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <CheckIcon color={decision === "approve" ? "#22c55e" : "#4b5563"} /> Approve
                </button>
                <button onClick={() => setDecision("reject")}
                  style={{ flex: 1, padding: "10px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, cursor: "pointer", background: decision === "reject" ? "#3f1a1a" : "#111118", border: `1.5px solid ${decision === "reject" ? "#ef4444" : "#1a1a28"}`, color: decision === "reject" ? "#ef4444" : "#4b5563", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <CloseIcon color={decision === "reject" ? "#ef4444" : "#4b5563"} /> Reject
                </button>
              </div>

              <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Mandatory: add your reasoning comment…" rows={3}
                style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", outline: "none", resize: "none", marginBottom: "16px", background: "#080810", border: "1px solid #1a1a28", color: "#e2e8f0", boxSizing: "border-box", fontFamily: "inherit" }} />

              <button
                disabled={!decision || !comment.trim() || submittingVote}
                onClick={handleSubmitVote}
                style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: decision && comment.trim() && !submittingVote ? "#3b82f6" : "#111118", color: decision && comment.trim() && !submittingVote ? "#fff" : "#374151", cursor: decision && comment.trim() && !submittingVote ? "pointer" : "not-allowed" }}>
                {submittingVote ? "Submitting…" : "Submit Vote"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}