// apps/web/src/pages/Officer-Tabs/ReviewQueue.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchReports, submitReportVote } from "../../lib/api";
import apiClient from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

const UNRESOLVED = ['pending', 'under_review', 'one_approval', 'two_approvals'];
const RESOLVED   = ['blacklisted', 'approved'];

const STATUS_ORDER = [
  { key: 'under_review',  label: 'Under Review',   color: '#f59e0b' },
  { key: 'one_approval',  label: '1 Approval',     color: '#3b82f6' },
  { key: 'two_approvals', label: '2 Approvals',    color: '#a855f7' },
  { key: 'pending',       label: 'Pending',        color: '#6b7280' },
  { key: 'blacklisted',   label: 'Blacklisted',    color: '#22c55e' },
  { key: 'approved',      label: 'Approved',       color: '#22c55e' },
];

const COL_WIDTHS = ['14%', '18%', '14%', '8%', '8%', '16%', '10%', '12%'];

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

const SearchIcon = ({ color = "#4b5563" }) => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke={color} strokeWidth="1.2" />
    <path d="M9.5 9.5l2.5 2.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

function formatTimestamp(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function mapReportToRow(r, currentUid) {
  const id = r.reportId || r.id || r._id;
  const ai = r.aiFlag || {};
  const approvals = r.consensusState?.approvals ?? 0;
  const rejections = r.consensusState?.rejections ?? 0;
  const totalVotes = approvals + rejections;

  const myVote = currentUid && (r.votes || []).find(v => v.userId === currentUid);

  const rawStatus = (r.status || "pending").toLowerCase();
  const displayStatus =
    rawStatus === "pending"        ? "Pending" :
    rawStatus === "under_review"   ? "Under Review" :
    rawStatus === "one_approval"   ? "1 Approval" :
    rawStatus === "two_approvals"  ? "2 Approvals" :
    rawStatus === "blacklisted"    ? "Blacklisted" :
    rawStatus === "approved"       ? "Approved" :
    rawStatus === "rejected"       ? "Rejected" :
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
    isResolved: RESOLVED.includes(rawStatus),
    isRejected: rawStatus === 'rejected',
    hasVoted: !!myVote,
    myDecision: myVote?.decision || null,
    votes: Array.isArray(r.votes) ? r.votes : [],
    evidenceText: r.evidenceText || r.content || r.textData || "",
    evidenceImage: r.evidenceImage || null,
    evidenceFiles: Array.isArray(r.evidenceFiles) ? r.evidenceFiles : [],
    aiLabel: ai.label || "unavailable",
    aiRiskLevel: ai.riskLevel || "UNKNOWN",
    aiConfidence: typeof ai.confidenceScore === "number" ? ai.confidenceScore : null,
    nullifierHash: r.nullifierHash || r.nullifier || null,
    zkpHash: r.zkpHash || null,
    jurisdiction: r.jurisdiction || "PH",
  };
}

export default function ReviewQueue() {
  const { user } = useAuth();
  const [tab, setTab] = useState("pending");
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [tabCounts, setTabCounts] = useState({
    allTab: 0, pendingTab: 0, votedTab: 0, resolvedTab: 0,
  });

  const [search, setSearch] = useState("");

  const [voteModal, setVoteModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReports({ limit: 200 });
      const list = Array.isArray(data) ? data : data.reports || data.data || [];
      const visible = list.filter(r => (r.status || '').toLowerCase() !== 'rejected');
      setReports(visible.map(r => mapReportToRow(r, user?.uid)));
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load review queue.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const loadTabCounts = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/api/v1/stats/badges');
      setTabCounts({
        allTab:      data?.data?.allTab      ?? 0,
        pendingTab:  data?.data?.pendingTab  ?? 0,
        votedTab:    data?.data?.votedTab    ?? 0,
        resolvedTab: data?.data?.resolvedTab ?? 0,
      });
    } catch (err) {
      console.warn('[ReviewQueue] tab counts fetch failed:', err?.message);
    }
  }, []);

  useEffect(() => {
    loadReports();
    loadTabCounts();
    const interval = setInterval(() => {
      loadReports();
      loadTabCounts();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadReports, loadTabCounts]);

  function handleTabClick(tabId) {
    setTab(tabId);

    if (tabId === "all" || tabId === "resolved" || tabId === "voted") {
      const tabKey = tabId === 'all' ? 'allTab' : tabId === 'resolved' ? 'resolvedTab' : 'votedTab';
      setTabCounts(prev => ({ ...prev, [tabKey]: 0 }));

      apiClient.post('/api/v1/stats/seen/review-tab', { tab: tabId })
        .then(() => {
          loadTabCounts();
          window.dispatchEvent(new CustomEvent('badges:refresh'));
        })
        .catch(() => {
          loadTabCounts();
          window.dispatchEvent(new CustomEvent('badges:refresh'));
        });
    }
  }

  const filtered = useMemo(() => {
    let list = reports;
    if (tab === "resolved") {
      list = reports.filter((r) => r.isResolved);
    } else if (tab === "pending") {
      list = reports.filter((r) => r.isUnresolved && !r.hasVoted);
    } else if (tab === "voted") {
      list = reports.filter((r) => r.isUnresolved && r.hasVoted);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.id.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [reports, tab, search]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((r) => {
      if (!groups[r.rawStatus]) groups[r.rawStatus] = [];
      groups[r.rawStatus].push(r);
    });
    return STATUS_ORDER
      .filter((s) => groups[s.key]?.length > 0)
      .map((s) => ({ ...s, items: groups[s.key] }));
  }, [filtered]);

  function closeModal() {
    setVoteModal(null);
    setDecision(null);
    setComment("");
  }

  async function handleSubmitVote() {
    if (!decision || !comment.trim() || !voteModal) return;
    setSubmittingVote(true);
    try {
      await submitReportVote(voteModal.id, { decision, comment: comment.trim() });
      closeModal();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      loadReports();
      loadTabCounts();
      window.dispatchEvent(new CustomEvent('badges:refresh'));
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || err.message || "Failed to submit vote.");
    } finally {
      setSubmittingVote(false);
    }
  }

  return (
    <div>
      <div style={{
        marginBottom: "16px", padding: "10px 14px", borderRadius: "10px",
        background: "#0e0e18", border: "1px solid #1a1a2a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
          <span style={{ fontSize: "11px", color: "#9ca3af", fontWeight: 600, letterSpacing: "0.5px" }}>REGION-SCOPED QUEUE</span>
        </div>
        <span style={{ fontSize: "11px", color: "#4b5563" }}>3-officer consensus required</span>
      </div>

      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
        {[
          { id: "all",      label: "All",      count: tabCounts.allTab },
          { id: "pending",  label: "Pending",  count: tabCounts.pendingTab },
          { id: "voted",    label: "Voted",    count: tabCounts.votedTab },
          { id: "resolved", label: "Resolved", count: tabCounts.resolvedTab },
        ].map((t) => (
          <button key={t.id} onClick={() => handleTabClick(t.id)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "12px", fontWeight: 500, background: "none", border: "none", cursor: "pointer", borderBottom: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent", color: tab === t.id ? "#3b82f6" : "#4b5563" }}>
            {t.label}
            {t.count > 0 && <span style={{ padding: "1px 6px", borderRadius: "999px", fontSize: "9px", fontWeight: 700, background: "#ef4444", color: "#fff" }}>{t.count}</span>}
          </button>
        ))}

        <div style={{ position: "relative", marginLeft: "auto", width: "220px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, number, type…"
            style={{ width: "100%", padding: "8px 12px 8px 30px", borderRadius: "8px", fontSize: "12px", background: "#0e0e18", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}
          />
        </div>

        <button onClick={() => { loadReports(); loadTabCounts(); }} disabled={loading}
          style={{ padding: "6px 12px", fontSize: "11px", fontWeight: 600, background: "none", border: "1px solid #1a1a2a", borderRadius: "8px", color: loading ? "#374151" : "#9ca3af", cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", background: "#1a0a0a", border: "1px solid #ef444440", color: "#ef4444" }}>
          {error}
        </div>
      )}

      {showSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
          <CheckIcon color="#22c55e" />
          Vote submitted successfully.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Incoming Reports</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>Click "Vote →" to review a case</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
            {loading ? "Loading reports…" : "No reports in this view."}
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.key}>
              <div style={{ padding: "10px 20px", background: "#080810", borderTop: "1px solid #1a1a2a", borderBottom: "1px solid #13131e", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: group.color }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: group.color, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>{group.label}</span>
                <span style={{ fontSize: "10px", color: "#4b5563", marginLeft: "4px" }}>({group.items.length})</span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <colgroup>
                  {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <tbody>
                  {group.items.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #13131e" }}>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.id.slice(0, 12)}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.number}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.type}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.channel}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.submitted}</td>
                      <td style={{ padding: "12px 20px", fontSize: "12px", color: row.priorVotes === "1 vote" ? "#f59e0b" : "#4b5563" }}>{row.priorVotes}</td>
                      <td style={{ padding: "12px 20px" }}>
                        {row.hasVoted ? (
                          <span style={{ fontSize: "11px", color: "#22c55e", fontWeight: 600 }}>✓ Voted</span>
                        ) : row.isUnresolved ? (
                          <button onClick={() => setVoteModal(row)}
                            style={{ fontSize: "11px", fontWeight: 600, color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                            Vote →
                          </button>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#374151" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {voteModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={closeModal}>
          <div style={{ width: "100%", maxWidth: "560px", maxHeight: "90vh", margin: "0 16px", borderRadius: "20px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#3b82f6,transparent)", zIndex: 1 }} />
            <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "28px 28px 16px", background: "#0e0e18", borderBottom: "1px solid #13131e" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>{voteModal.id.slice(0, 12)}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{voteModal.type} · {voteModal.channel} · {voteModal.reports} reports</div>
              </div>
              <button onClick={closeModal} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", borderRadius: "6px" }}>
                <CloseIcon color="currentColor" size={18} />
              </button>
            </div>
            <div style={{ padding: "20px 28px 28px", overflowY: "auto" }}>
              <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{voteModal.number}</div>
                <div style={{ fontSize: "11px", color: "#4b5563" }}>Prior votes: {voteModal.priorVotes} · Submitted {voteModal.submitted}</div>
              </div>

              {voteModal.votes.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "8px", fontFamily: "'JetBrains Mono',monospace" }}>
                    PRIOR VOTES ({voteModal.votes.length}/3)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {voteModal.votes.map((v, i) => (
                      <div key={i} style={{ padding: "10px 14px", borderRadius: "8px", background: "#080810", border: `1px solid ${v.decision === 'approve' ? '#22c55e30' : '#ef444430'}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <span style={{ fontSize: "11px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>
                            Officer #{i + 1} · {(v.userId || '').slice(-6)}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: v.decision === 'approve' ? '#22c55e' : '#ef4444' }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: v.decision === 'approve' ? '#22c55e' : '#ef4444' }} />
                            {v.decision === 'approve' ? 'Approved' : 'Rejected'}
                          </span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.5 }}>"{v.comment || 'No comment'}"</div>
                        <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace" }}>
                          {formatTimestamp(v.votedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {voteModal.evidenceImage && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>SCREENSHOT EVIDENCE</div>
                  <div style={{ borderRadius: "8px", overflow: "hidden", background: "#080810", border: "1px solid #13131e", maxHeight: "260px", display: "flex", justifyContent: "center" }}>
                    <img src={voteModal.evidenceImage} alt="Screenshot" style={{ maxWidth: "100%", maxHeight: "260px", objectFit: "contain" }} />
                  </div>
                </div>
              )}

              {voteModal.evidenceText && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>EXTRACTED TEXT</div>
                  <div style={{ padding: "12px", borderRadius: "8px", fontSize: "12px", lineHeight: 1.5, background: "#080810", border: "1px solid #13131e", color: "#cbd5e1", whiteSpace: "pre-wrap", maxHeight: "160px", overflowY: "auto", fontFamily: "'JetBrains Mono',monospace" }}>
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

              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Mandatory: add your reasoning comment…" rows={3}
                style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", outline: "none", resize: "none", marginBottom: "16px", background: "#080810", border: "1px solid #1a1a28", color: "#e2e8f0", boxSizing: "border-box" }} />

              <button disabled={!decision || !comment.trim() || submittingVote} onClick={handleSubmitVote}
                style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: decision && comment.trim() && !submittingVote ? "#3b82f6" : "#111118", color: decision && comment.trim() && !submittingVote ? "#fff" : "#374151", cursor: decision && comment.trim() && !submittingVote ? "pointer" : "not-allowed" }}>
                {submittingVote ? "Submitting…" : "Submit Vote"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}