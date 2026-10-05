// apps/web/src/pages/Officer-Tabs/ReviewQueue.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// 10 columns: ID, NUMBER, TYPE, SUBTYPE, REPORTER, REPORTS, CHANNEL, SUBMITTED, PRIOR VOTES, ACTION
const COL_WIDTHS = ['10%', '12%', '10%', '13%', '12%', '6%', '6%', '12%', '9%', '10%'];

// ─── Prior-votes color: amber for any vote, grey only when none ──────
function priorVotesColor(label) {
  return label === "None" ? "#4b5563" : "#f59e0b";
}
// ─────────────────────────────────────────────────────────────────────

// ─── Action column button styles ─────────────────────────────────────
const ACTION_BTN_BASE = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "5px 11px",
  borderRadius: "7px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid transparent",
  transition: "background 0.12s ease, border-color 0.12s ease",
  whiteSpace: "nowrap",
  fontFamily: "'Inter', system-ui, sans-serif",
};

const ACTION_BTN_BLUE = {
  ...ACTION_BTN_BASE,
  background: "rgba(59,130,246,0.10)",
  borderColor: "rgba(59,130,246,0.35)",
  color: "#60a5fa",
};
const ACTION_BTN_BLUE_HOVER = { background: "rgba(59,130,246,0.22)" };
// ─────────────────────────────────────────────────────────────────────

// ─── SUBTYPE TAXONOMY (Level 2) ──────────────────────────────────────
const SUBTYPES_BY_TIER = {
  legitimate: [
    'personal_conversational',
    'two_factor_auth',
    'appointment_reminder',
    'delivery_tracking',
    'bank_activity_alert',
  ],
  grey_area: ['brand_marketing'],
  malicious: [
    'phishing_link',
    'fake_prize_lottery',
    'wrong_number_baiting',
    'urgent_fine_toll',
    'impersonation_family',
  ],
};

const SUBTYPE_LABELS = {
  personal_conversational: 'Personal Conversation',
  two_factor_auth: 'One-Time Password (OTP)',
  appointment_reminder: 'Appointment Reminder',
  delivery_tracking: 'Delivery Tracking',
  bank_activity_alert: 'Bank Activity Alert',
  brand_marketing: 'Brand Marketing',
  phishing_link: 'Phishing Link (Smishing)',
  fake_prize_lottery: 'Fake Prize / Lottery',
  wrong_number_baiting: 'Wrong-Number Baiting',
  urgent_fine_toll: 'Urgent Fine / Toll',
  impersonation_family: 'Impersonation (Family)',
};

const RISK_TIER_STYLES = {
  malicious: { dot: '#f43f5e', text: '#fb7185', bg: 'rgba(244,63,94,0.06)', border: 'rgba(244,63,94,0.25)' },
  grey_area: { dot: '#eab308', text: '#facc15', bg: 'rgba(234,179,8,0.06)', border: 'rgba(234,179,8,0.25)' },
  legitimate: { dot: '#10b981', text: '#34d399', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.25)' },
};

// ─── SVG ICONS ───────────────────────────────────────────────────────
const CheckIcon = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

const PencilIcon = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const EyeIcon = ({ color = "#60a5fa", size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const QuestionIcon = ({ color, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const StarIcon = ({ color = "#f59e0b", size = 14, filled = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const ChevronDownIcon = ({ color = "#64748b", size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
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
    myComment: myVote?.comment || "",
    myEditedAt: myVote?.editedAt || null,
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
    reporterName: r.reporterName || null,
    reporterEmail: r.reporterEmail || null,
    reporterShared: Boolean(r.reporterShared),
    aiSubtype: ai.subtype || r.aiSubtype || null,
    aiSubtypeConfidence: typeof ai.subtypeConfidence === "number"
      ? ai.subtypeConfidence
      : (typeof r.aiSubtypeConfidence === "number" ? r.aiSubtypeConfidence : null),
    aiSubtypeModelVersion: ai.subtypeModelVersion || r.aiSubtypeModelVersion || null,
    aiExplanationReasons: Array.isArray(ai.explanationReasons)
      ? ai.explanationReasons
      : (Array.isArray(r.aiExplanationReasons) ? r.aiExplanationReasons : []),
    mySubtypeAction: myVote?.subtypeAction || null,
    myCorrectedSubtype: myVote?.correctedSubtype || null,
    myIsHighValue: Boolean(myVote?.isHighValue),
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
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [submittingVote, setSubmittingVote] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── SUBTYPE VERIFICATION STATE (continuous learning) ─────────────
  const [subtypeAction, setSubtypeAction] = useState(null);
  const [correctedSubtype, setCorrectedSubtype] = useState(null);
  const [isHighValue, setIsHighValue] = useState(false);

  const [zoomImage, setZoomImage] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  useEffect(() => {
    if (!voteModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voteModal]);

  useEffect(() => {
    if (zoomScale <= 1 && (pan.x !== 0 || pan.y !== 0)) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoomScale, pan.x, pan.y]);

  function openZoom(src) {
    setZoomImage(src);
    setZoomScale(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }
  function closeZoom() {
    setZoomImage(null);
    setZoomScale(1);
    setPan({ x: 0, y: 0 });
    setDragging(false);
  }

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

  async function openVoteModal(row) {
    const prefillDecision = row.hasVoted ? row.myDecision : null;
    const prefillComment  = row.hasVoted ? (row.myComment || "") : "";

    setDecision(prefillDecision);
    setComment(prefillComment);
    setIsEditMode(false);
    setLoadingDetail(true);

    setSubtypeAction(row.mySubtypeAction || null);
    setCorrectedSubtype(row.myCorrectedSubtype || null);
    setIsHighValue(Boolean(row.myIsHighValue));

    setVoteModal({ ...row, evidenceImage: null, _loadingImage: true });

    try {
      const { data } = await apiClient.get(`/api/v1/reports/${row.id}`);
      const full = data?.data || data?.report || data;

      const freshMyVote = (full?.votes || []).find(v => v.userId === user?.uid);

      setVoteModal({
        ...row,
        evidenceImage: full?.evidenceImage || null,
        evidenceText: full?.evidenceText || full?.content || row.evidenceText,
        votes: Array.isArray(full?.votes) ? full.votes : row.votes,
        hasVoted: !!freshMyVote,
        myDecision: freshMyVote?.decision || row.myDecision,
        myComment: freshMyVote?.comment || "",
        myEditedAt: freshMyVote?.editedAt || null,
        reporterName: full?.reporterName ?? row.reporterName ?? null,
        reporterEmail: full?.reporterEmail ?? row.reporterEmail ?? null,
        reporterShared: Boolean(full?.reporterShared ?? row.reporterShared),
        aiSubtype: full?.aiFlag?.subtype || full?.aiSubtype || row.aiSubtype || null,
        aiSubtypeConfidence:
          (typeof full?.aiFlag?.subtypeConfidence === "number" ? full.aiFlag.subtypeConfidence : null) ??
          (typeof full?.aiSubtypeConfidence === "number" ? full.aiSubtypeConfidence : null) ??
          row.aiSubtypeConfidence ?? null,
        aiSubtypeModelVersion:
          full?.aiFlag?.subtypeModelVersion || full?.aiSubtypeModelVersion || row.aiSubtypeModelVersion || null,
        aiExplanationReasons:
          Array.isArray(full?.aiFlag?.explanationReasons) ? full.aiFlag.explanationReasons :
          Array.isArray(full?.aiExplanationReasons) ? full.aiExplanationReasons :
          row.aiExplanationReasons || [],
        _loadingImage: false,
      });

      if (freshMyVote) {
        setDecision(freshMyVote.decision);
        setComment(freshMyVote.comment || "");
        setSubtypeAction(freshMyVote.subtypeAction || null);
        setCorrectedSubtype(freshMyVote.correctedSubtype || null);
        setIsHighValue(Boolean(freshMyVote.isHighValue));
      }
    } catch (err) {
      console.error('[ReviewQueue] detail fetch failed:', err);
      setVoteModal({ ...row, _loadingImage: false });
    } finally {
      setLoadingDetail(false);
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
        r.type.toLowerCase().includes(q) ||
        (r.aiSubtype || "").toLowerCase().includes(q) ||
        (r.reporterName || "").toLowerCase().includes(q) ||
        (r.reporterEmail || "").toLowerCase().includes(q)
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
    setIsEditMode(false);
    setSavingEdit(false);
    setSubtypeAction(null);
    setCorrectedSubtype(null);
    setIsHighValue(false);
  }

  const modalMode = !voteModal
    ? 'vote'
    : voteModal.isResolved
      ? 'read'
      : voteModal.hasVoted
        ? (isEditMode ? 'edit' : 'read')
        : 'vote';

  function buildSubtypePayload() {
    return {
      subtypeAction: subtypeAction || null,
      correctedSubtype: subtypeAction === 'corrected' ? correctedSubtype : null,
      isHighValue: Boolean(isHighValue),
      aiSubtypeAtVote: voteModal?.aiSubtype || null,
      aiSubtypeModelVersionAtVote: voteModal?.aiSubtypeModelVersion || null,
    };
  }

  async function handleSubmitVote() {
    if (!decision || !comment.trim() || !voteModal) return;
    if (subtypeAction === 'corrected' && !correctedSubtype) {
      alert("Please choose the correct subtype, or pick a different option.");
      return;
    }
    setSubmittingVote(true);
    try {
      await submitReportVote(voteModal.id, {
        decision,
        comment: comment.trim(),
        ...buildSubtypePayload(),
      });
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

  async function handleSaveEdit() {
    if (!decision || !comment.trim() || !voteModal) return;
    if (subtypeAction === 'corrected' && !correctedSubtype) {
      alert("Please choose the correct subtype, or pick a different option.");
      return;
    }
    setSavingEdit(true);
    try {
      await apiClient.patch(`/api/v1/reports/${voteModal.id}/vote`, {
        decision,
        comment: comment.trim(),
        ...buildSubtypePayload(),
      });
      closeModal();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      loadReports();
      loadTabCounts();
      window.dispatchEvent(new CustomEvent('badges:refresh'));
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || err.message || "Failed to update vote.");
    } finally {
      setSavingEdit(false);
    }
  }

  function enterEditMode() {
    setDecision(voteModal.myDecision || null);
    setComment(voteModal.myComment || "");
    setSubtypeAction(voteModal.mySubtypeAction || null);
    setCorrectedSubtype(voteModal.myCorrectedSubtype || null);
    setIsHighValue(Boolean(voteModal.myIsHighValue));
    setIsEditMode(true);
  }

  function cancelEditMode() {
    setDecision(voteModal.myDecision || null);
    setComment(voteModal.myComment || "");
    setSubtypeAction(voteModal.mySubtypeAction || null);
    setCorrectedSubtype(voteModal.myCorrectedSubtype || null);
    setIsHighValue(Boolean(voteModal.myIsHighValue));
    setIsEditMode(false);
  }

  const submitDisabled =
    !decision || !comment.trim() || submittingVote || savingEdit ||
    (subtypeAction === 'corrected' && !correctedSubtype);

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

        <div style={{ position: "relative", marginLeft: "auto", width: "240px" }}>
          <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
            <SearchIcon />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, number, type, subtype…"
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
          Vote saved. Your subtype feedback is queued for the next retraining run.
        </div>
      )}

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #1a1a2a" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Incoming Reports</div>
          <div style={{ fontSize: "11px", marginTop: "2px", color: "#4b5563" }}>
            {tab === 'pending'
              ? 'Click "Review" to open a case'
              : tab === 'voted'
                ? 'Click "Edit vote" to change your decision'
                : tab === 'resolved'
                  ? 'Click "View" to inspect the final decision'
                  : 'Click the action button to open a case'}
          </div>
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
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
                    {['ID', 'NUMBER', 'TYPE', 'SUBTYPE', 'REPORTER', 'RPT', 'CH.', 'SUBMITTED', 'PRIOR VOTES', 'ACTION'].map((h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: "8px 20px",
                          textAlign: i === 9 ? "center" : "left",
                          fontSize: "9px",
                          fontWeight: 700,
                          letterSpacing: "1px",
                          color: "#4b5563",
                          fontFamily: "'JetBrains Mono',monospace",
                          textTransform: "uppercase",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((row) => {
                    const tier = RISK_TIER_STYLES[row.aiLabel] || null;
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom: "1px solid #13131e",
                          transition: "background 0.12s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#101020"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.id.slice(0, 12)}</td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.number}</td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.type}</td>
                        <td style={{ padding: "12px 20px", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.aiSubtype ? (
                            <span style={{ padding: "2px 8px", borderRadius: "6px", fontFamily: "'JetBrains Mono',monospace", color: tier ? tier.text : "#a5b4fc", background: tier ? tier.bg : "rgba(79,70,229,0.08)", border: `1px solid ${tier ? tier.border : "rgba(79,70,229,0.2)"}` }}>
                              {row.aiSubtype}
                            </span>
                          ) : (
                            <span style={{ color: "#4b5563" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.reporterShared && row.reporterName
                            ? row.reporterName
                            : <span style={{ color: "#4b5563", fontStyle: "italic" }}>Anonymous</span>}
                        </td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.channel}</td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.submitted}</td>
                        <td style={{ padding: "12px 20px", fontSize: "12px", color: priorVotesColor(row.priorVotes), fontWeight: row.priorVotes === "None" ? 400 : 600 }}>{row.priorVotes}</td>
                        <td style={{ padding: "12px 20px", verticalAlign: "middle", textAlign: "center" }}>
                          {row.isResolved ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openVoteModal(row); }}
                              style={ACTION_BTN_BLUE}
                              onMouseEnter={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE_HOVER)}
                              onMouseLeave={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE)}
                            >
                              <EyeIcon color="#60a5fa" size={11} /> View
                            </button>
                          ) : row.hasVoted ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openVoteModal(row); }}
                              style={ACTION_BTN_BLUE}
                              onMouseEnter={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE_HOVER)}
                              onMouseLeave={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE)}
                            >
                              <PencilIcon color="#60a5fa" size={11} /> Edit vote
                            </button>
                          ) : row.isUnresolved ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openVoteModal(row); }}
                              style={ACTION_BTN_BLUE}
                              onMouseEnter={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE_HOVER)}
                              onMouseLeave={(e) => Object.assign(e.currentTarget.style, ACTION_BTN_BLUE)}
                            >
                              Review
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#374151" }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {voteModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={closeModal}>
          <div style={{ width: "100%", maxWidth: "600px", maxHeight: "90vh", margin: "0 16px", borderRadius: "20px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
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

              {voteModal.isResolved && (
                <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: "#0a1a12", border: "1px solid #22c55e30", fontSize: "11px", color: "#22c55e", display: "flex", alignItems: "center", gap: "8px" }}>
                  <CheckIcon color="#22c55e" />
                  This case is finalized. Votes can no longer be changed.
                </div>
              )}

              {/* ─── AI CLASSIFICATION (Level 1 + Level 2) ─────────────── */}
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "8px", fontFamily: "'JetBrains Mono',monospace" }}>
                  AI CLASSIFICATION
                </div>

                {voteModal.aiSubtype ? (
                  (() => {
                    const tier = RISK_TIER_STYLES[voteModal.aiLabel] || RISK_TIER_STYLES.grey_area;
                    return (
                      <div style={{ padding: "14px 16px", borderRadius: "10px", background: tier.bg, border: `1px solid ${tier.border}` }}>
                        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: voteModal.aiExplanationReasons?.length > 0 ? "12px" : 0 }}>
                          <div style={{ flex: "0 0 auto", minWidth: "110px" }}>
                            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>RISK TIER</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: tier.dot }} />
                              <span style={{ fontSize: "12px", fontWeight: 700, color: tier.text, fontFamily: "'JetBrains Mono',monospace", textTransform: "uppercase" }}>
                                {voteModal.aiRiskLevel}
                              </span>
                            </div>
                            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px" }}>{voteModal.aiLabel}</div>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>SUBTYPE</div>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px", wordBreak: "break-word" }}>
                              {voteModal.aiSubtype}
                            </div>
                            <div style={{ fontSize: "10px", color: "#64748b" }}>
                              {voteModal.aiSubtypeConfidence != null
                                ? `${(voteModal.aiSubtypeConfidence * 100).toFixed(1)}% confidence`
                                : "confidence unavailable"}
                              {voteModal.aiSubtypeModelVersion && (
                                <span style={{ marginLeft: "8px" }}>· {voteModal.aiSubtypeModelVersion}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {voteModal.aiExplanationReasons?.length > 0 && (
                          <div style={{ paddingTop: "12px", borderTop: "1px solid rgba(148,163,184,0.08)" }}>
                            <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "8px" }}>
                              WHY THE AI FLAGGED THIS
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {voteModal.aiExplanationReasons.map((reason, i) => (
                                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                                  <span style={{ fontSize: "10px", color: "#818cf8", fontWeight: 700, marginTop: "1px", flexShrink: 0 }}>{i + 1}.</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "11px", fontWeight: 600, color: "#cbd5e1" }}>{reason.category}</div>
                                    <div style={{ fontSize: "10px", color: "#64748b", lineHeight: 1.4 }}>{reason.description}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div style={{ padding: "12px 14px", borderRadius: "10px", background: "rgba(148,163,184,0.03)", border: "1px solid rgba(148,163,184,0.08)", fontSize: "11px", color: "#64748b", fontStyle: "italic" }}>
                    No subtype available for this report (subtype model may not have loaded when it was submitted).
                  </div>
                )}
              </div>

              {/* ─── REPORTER IDENTITY ──────────────────────────────────── */}
              <div style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "16px", background: voteModal.reporterShared ? "rgba(59,130,246,0.06)" : "rgba(148,163,184,0.03)", border: `1px solid ${voteModal.reporterShared ? "rgba(59,130,246,0.25)" : "rgba(148,163,184,0.08)"}` }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                  REPORTED BY
                </div>
                {voteModal.reporterShared && (voteModal.reporterName || voteModal.reporterEmail) ? (
                  <div>
                    <div style={{ fontSize: "13px", color: "#e2e8f0", fontWeight: 600 }}>
                      {voteModal.reporterName || "(no name provided)"}
                    </div>
                    {voteModal.reporterEmail && (
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                        {voteModal.reporterEmail}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: "12px", color: "#64748b", fontStyle: "italic" }}>
                    Anonymous reporter — citizen did not opt to share their identity.
                  </div>
                )}
              </div>

              {voteModal.votes.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "8px", fontFamily: "'JetBrains Mono',monospace" }}>
                    PRIOR VOTES ({voteModal.votes.length}/3)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {voteModal.votes.map((v, i) => {
                      const mine = v.userId === user?.uid;
                      return (
                        <div key={i} style={{ padding: "10px 14px", borderRadius: "8px", background: "#080810", border: `1px solid ${v.decision === 'approve' ? '#22c55e30' : '#ef444430'}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", color: mine ? "#9ca3af" : "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>
                              {mine ? 'You' : `Officer · ${(v.userId || '').slice(-6)}`}{v.editedAt ? ' · edited' : ''}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: v.decision === 'approve' ? '#22c55e' : '#ef4444' }}>
                              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: v.decision === 'approve' ? '#22c55e' : '#ef4444' }} />
                              {v.decision === 'approve' ? 'Approved' : 'Rejected'}
                            </span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#9ca3af", lineHeight: 1.5 }}>"{v.comment || 'No comment'}"</div>

                          {(v.subtypeAction || v.isHighValue) && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                              {v.subtypeAction && (
                                <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", background: v.subtypeAction === 'confirmed' ? "rgba(34,197,94,0.1)" : v.subtypeAction === 'corrected' ? "rgba(59,130,246,0.1)" : "rgba(234,179,8,0.1)", border: `1px solid ${v.subtypeAction === 'confirmed' ? '#22c55e40' : v.subtypeAction === 'corrected' ? '#3b82f640' : '#eab30840'}`, color: v.subtypeAction === 'confirmed' ? "#22c55e" : v.subtypeAction === 'corrected' ? "#3b82f6" : "#facc15" }}>
                                  {v.subtypeAction === 'confirmed' && 'Confirmed: '}
                                  {v.subtypeAction === 'corrected' && 'Corrected: '}
                                  {v.subtypeAction === 'unsure' && 'Unsure'}
                                  {v.subtypeAction === 'corrected' && v.correctedSubtype ? v.correctedSubtype : ''}
                                </span>
                              )}
                              {v.isHighValue && (
                                <span style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", background: "rgba(245,158,11,0.1)", border: "1px solid #f59e0b40", color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <StarIcon color="#f59e0b" size={10} filled /> High-value
                                </span>
                              )}
                            </div>
                          )}
                          <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                            {formatTimestamp(v.votedAt)}
                            {v.editedAt ? ` · edited ${formatTimestamp(v.editedAt)}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {voteModal._loadingImage && (
                <div style={{ marginBottom: "16px", padding: "24px", borderRadius: "8px", background: "#080810", border: "1px solid #13131e", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                  <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(59,130,246,0.3)", borderTopColor: "#3b82f6", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  <span style={{ fontSize: "12px", color: "#4b5563" }}>Loading evidence…</span>
                </div>
              )}

              {!voteModal._loadingImage && voteModal.evidenceImage && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563" }}>SCREENSHOT EVIDENCE</div>
                    <div style={{ fontSize: "10px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>Click to zoom</div>
                  </div>
                  <div
                    onClick={() => openZoom(voteModal.evidenceImage)}
                    style={{ borderRadius: "8px", overflow: "hidden", background: "#080810", border: "1px solid #13131e", maxHeight: "320px", display: "flex", justifyContent: "center", cursor: "zoom-in", transition: "border-color 0.15s ease" }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = "#3b82f6"}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = "#13131e"}
                  >
                    <img src={voteModal.evidenceImage} alt="Screenshot evidence" style={{ maxWidth: "100%", maxHeight: "320px", objectFit: "contain", pointerEvents: "none" }} />
                  </div>
                </div>
              )}

              {!voteModal._loadingImage && !voteModal.evidenceImage && (
                <div style={{ marginBottom: "16px", padding: "14px 16px", borderRadius: "8px", background: "#080810", border: "1px solid #13131e", fontSize: "11px", color: "#4b5563", textAlign: "center" }}>
                  No screenshot attached to this report.
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

              {modalMode === 'read' && !voteModal.isResolved && voteModal.hasVoted && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "6px" }}>YOUR VOTE</div>
                  <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#080810", border: `1px solid ${voteModal.myDecision === 'approve' ? '#22c55e40' : '#ef444440'}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", color: voteModal.myDecision === 'approve' ? '#22c55e' : '#ef4444', fontSize: "12px", fontWeight: 700 }}>
                      {voteModal.myDecision === 'approve' ? <CheckIcon color="#22c55e" /> : <CloseIcon color="#ef4444" />}
                      {voteModal.myDecision === 'approve' ? 'You approved this report' : 'You rejected this report'}
                    </div>
                    <div style={{ fontSize: "12px", color: "#cbd5e1", lineHeight: 1.5 }}>"{voteModal.myComment || 'No comment'}"</div>

                    {(voteModal.mySubtypeAction || voteModal.myIsHighValue) && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(148,163,184,0.08)", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {voteModal.mySubtypeAction && (
                          <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", background: voteModal.mySubtypeAction === 'confirmed' ? "rgba(34,197,94,0.1)" : voteModal.mySubtypeAction === 'corrected' ? "rgba(59,130,246,0.1)" : "rgba(234,179,8,0.1)", border: `1px solid ${voteModal.mySubtypeAction === 'confirmed' ? '#22c55e40' : voteModal.mySubtypeAction === 'corrected' ? '#3b82f640' : '#eab30840'}`, color: voteModal.mySubtypeAction === 'confirmed' ? "#22c55e" : voteModal.mySubtypeAction === 'corrected' ? "#3b82f6" : "#facc15" }}>
                            {voteModal.mySubtypeAction === 'confirmed' && 'Subtype confirmed: '}
                            {voteModal.mySubtypeAction === 'corrected' && 'Subtype corrected: '}
                            {voteModal.mySubtypeAction === 'unsure' && 'Subtype unsure'}
                            {voteModal.mySubtypeAction === 'confirmed' && voteModal.aiSubtype ? voteModal.aiSubtype : ''}
                            {voteModal.mySubtypeAction === 'corrected' && voteModal.myCorrectedSubtype ? voteModal.myCorrectedSubtype : ''}
                          </span>
                        )}
                        {voteModal.myIsHighValue && (
                          <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "10px", fontFamily: "'JetBrains Mono',monospace", background: "rgba(245,158,11,0.1)", border: "1px solid #f59e0b40", color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <StarIcon color="#f59e0b" size={10} filled /> Marked high-value
                          </span>
                        )}
                      </div>
                    )}

                    {voteModal.myEditedAt && (
                      <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                        edited {formatTimestamp(voteModal.myEditedAt)}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={enterEditMode}
                    style={{ marginTop: "12px", width: "100%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 700, background: "rgba(59,130,246,0.10)", border: "1.5px solid rgba(59,130,246,0.35)", color: "#60a5fa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    <PencilIcon color="#60a5fa" size={12} /> Edit vote
                  </button>
                </div>
              )}

              {(modalMode === 'vote' || modalMode === 'edit') && (
                <>
                  {modalMode === 'edit' && (
                    <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: "#0a1020", border: "1px solid #3b82f630", fontSize: "11px", color: "#93c5fd" }}>
                      You are editing your vote. Your original timestamp will be kept, and an edit timestamp will be recorded.
                    </div>
                  )}

                  {voteModal.aiSubtype && (
                    <div style={{ marginBottom: "20px", padding: "14px 16px", borderRadius: "10px", background: "#080810", border: "1px solid #1a1a28" }}>
                      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", marginBottom: "8px", fontFamily: "'JetBrains Mono',monospace" }}>
                        SUBTYPE VERIFICATION
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "12px", lineHeight: 1.5 }}>
                        Your answer becomes a training signal. Confirmed examples reinforce the model; corrected examples teach it the right label; unsure examples are excluded from the next retrain.
                      </div>

                      <div style={{ display: "flex", gap: "8px", marginBottom: subtypeAction === 'corrected' ? "14px" : "0" }}>
                        <button
                          type="button"
                          onClick={() => { setSubtypeAction('confirmed'); setCorrectedSubtype(null); }}
                          style={{ flex: 1, padding: "12px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: subtypeAction === 'confirmed' ? "rgba(34,197,94,0.12)" : "#111118", border: `1.5px solid ${subtypeAction === 'confirmed' ? "#22c55e" : "#1a1a28"}`, color: subtypeAction === 'confirmed' ? "#22c55e" : "#64748b" }}
                        >
                          <CheckIcon color={subtypeAction === 'confirmed' ? "#22c55e" : "#64748b"} size={16} />
                          <span>Confirm AI</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSubtypeAction('corrected')}
                          style={{ flex: 1, padding: "12px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: subtypeAction === 'corrected' ? "rgba(59,130,246,0.12)" : "#111118", border: `1.5px solid ${subtypeAction === 'corrected' ? "#3b82f6" : "#1a1a28"}`, color: subtypeAction === 'corrected' ? "#3b82f6" : "#64748b" }}
                        >
                          <PencilIcon color={subtypeAction === 'corrected' ? "#3b82f6" : "#64748b"} size={16} />
                          <span>Correct AI</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => { setSubtypeAction('unsure'); setCorrectedSubtype(null); }}
                          style={{ flex: 1, padding: "12px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: subtypeAction === 'unsure' ? "rgba(234,179,8,0.1)" : "#111118", border: `1.5px solid ${subtypeAction === 'unsure' ? "#eab308" : "#1a1a28"}`, color: subtypeAction === 'unsure' ? "#facc15" : "#64748b" }}
                        >
                          <QuestionIcon color={subtypeAction === 'unsure' ? "#facc15" : "#64748b"} size={16} />
                          <span>Unsure</span>
                        </button>
                      </div>

                      {subtypeAction === 'corrected' && (
                        <div style={{ marginBottom: "14px", position: "relative" }}>
                          <label style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: "#4b5563", display: "block", marginBottom: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                            CORRECT SUBTYPE
                          </label>
                          <div style={{ position: "relative" }}>
                            <select
                              value={correctedSubtype || ''}
                              onChange={(e) => setCorrectedSubtype(e.target.value || null)}
                              style={{ width: "100%", padding: "10px 32px 10px 12px", borderRadius: "10px", fontSize: "12px", background: "#111118", border: "1px solid #1a1a28", color: "#e2e8f0", outline: "none", cursor: "pointer", appearance: "none", WebkitAppearance: "none", fontFamily: "'JetBrains Mono',monospace" }}
                            >
                              <option value="">— Choose the correct subtype —</option>
                              {(SUBTYPES_BY_TIER[voteModal.aiLabel] || []).map((st) => (
                                <option key={st} value={st}>
                                  {SUBTYPE_LABELS[st] || st}
                                  {st === voteModal.aiSubtype ? '  (current AI pick)' : ''}
                                </option>
                              ))}
                            </select>
                            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                              <ChevronDownIcon />
                            </span>
                          </div>
                        </div>
                      )}

                      <label style={{ display: "flex", alignItems: "center", gap: "10px", paddingTop: "12px", borderTop: "1px solid rgba(148,163,184,0.06)", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={isHighValue}
                          onChange={(e) => setIsHighValue(e.target.checked)}
                          style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#f59e0b" }}
                        />
                        <span style={{ fontSize: "11px", color: "#94a3b8", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <StarIcon color="#f59e0b" size={12} filled={isHighValue} />
                          Mark as high-value training example
                          <span style={{ color: "#4b5563" }}>(weighted 3x in the next retrain)</span>
                        </span>
                      </label>

                      {subtypeAction === 'confirmed' && (
                        <div style={{ marginTop: "10px", fontSize: "10px", color: "#22c55e", fontStyle: "italic" }}>
                          Your confirmation will be logged with weight 2.0 in the next retraining run.
                        </div>
                      )}
                      {subtypeAction === 'corrected' && correctedSubtype && (
                        <div style={{ marginTop: "10px", fontSize: "10px", color: "#3b82f6", fontStyle: "italic" }}>
                          Your correction ({voteModal.aiSubtype} → {correctedSubtype}) will be logged with weight 2.5 — the model will learn from this.
                        </div>
                      )}
                      {subtypeAction === 'unsure' && (
                        <div style={{ marginTop: "10px", fontSize: "10px", color: "#facc15", fontStyle: "italic" }}>
                          This report will be excluded from training. Use this when the evidence is genuinely ambiguous.
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── WHAT DO APPROVE / REJECT MEAN? ──────────────── */}
                  <div style={{
                    marginBottom: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    background: "#080810",
                    border: "1px solid #1a1a28",
                    fontSize: "12px",
                    color: "#94a3b8",
                    lineHeight: 1.55,
                  }}>
                    <div style={{ fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                      Decide whether this report is a genuine scam
                    </div>
                    <div style={{ marginBottom: "4px" }}>
                      <strong style={{ color: "#22c55e" }}>Approve</strong> — you agree the number/message is a real scam. When two out of three officers approve, the number is added to the blacklist.
                    </div>
                    <div>
                      <strong style={{ color: "#ef4444" }}>Reject</strong> — you believe this is a false alarm or legitimate. When two out of three officers reject, the case is closed as not-a-scam.
                    </div>
                  </div>

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

                  {modalMode === 'edit' ? (
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button onClick={cancelEditMode} disabled={savingEdit}
                        style={{ flex: 1, padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: savingEdit ? "not-allowed" : "pointer" }}>
                        Cancel
                      </button>
                      <button disabled={submitDisabled} onClick={handleSaveEdit}
                        style={{ flex: 2, padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: !submitDisabled ? "#3b82f6" : "#111118", color: !submitDisabled ? "#fff" : "#374151", cursor: !submitDisabled ? "pointer" : "not-allowed" }}>
                        {savingEdit ? "Saving…" : "Save changes"}
                      </button>
                    </div>
                  ) : (
                    <button disabled={submitDisabled} onClick={handleSubmitVote}
                      style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: !submitDisabled ? "#3b82f6" : "#111118", color: !submitDisabled ? "#fff" : "#374151", cursor: !submitDisabled ? "pointer" : "not-allowed" }}>
                      {submittingVote ? "Submitting…" : "Submit vote"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomImage && (
        <div
          onWheel={(e) => {
            e.preventDefault();
            setZoomScale((s) => {
              const next = Math.min(Math.max(s + (e.deltaY < 0 ? 0.15 : -0.15), 1), 5);
              if (next <= 1) setPan({ x: 0, y: 0 });
              return next;
            });
          }}
          onMouseDown={(e) => { e.stopPropagation(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: "rgba(0,0,0,0.94)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "40px",
            cursor: dragging ? "grabbing" : (zoomScale > 1 ? "grab" : "default"),
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          <img
            src={zoomImage}
            alt="Screenshot evidence — zoomed"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              if (zoomScale <= 1) return;
              e.preventDefault();
              e.stopPropagation();
              dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
              setDragging(true);
            }}
            onMouseMove={(e) => {
              if (!dragging) return;
              const dx = e.clientX - dragStart.current.x;
              const dy = e.clientY - dragStart.current.y;
              setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
            }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            style={{
              maxWidth: "95vw",
              maxHeight: "95vh",
              objectFit: "contain",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomScale})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 0.12s ease-out",
              boxShadow: "0 40px 100px rgba(0,0,0,0.85)",
              border: "1px solid #1a1a2a",
              borderRadius: "8px",
              userSelect: "none",
              cursor: zoomScale > 1 ? (dragging ? "grabbing" : "grab") : "default",
            }}
            draggable={false}
          />

          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)",
              display: "flex", alignItems: "center", gap: "8px",
              padding: "8px 12px", borderRadius: "999px",
              background: "#0e0e18", border: "1px solid #1a1a2a",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
            }}
          >
            <button
              onClick={() => setZoomScale((s) => {
                const next = Math.max(s - 0.25, 1);
                if (next <= 1) setPan({ x: 0, y: 0 });
                return next;
              })}
              disabled={zoomScale <= 1}
              style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#111120", border: "1px solid #1a1a2a", color: zoomScale <= 1 ? "#374151" : "#e2e8f0", fontSize: "16px", cursor: zoomScale <= 1 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >−</button>
            <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace", minWidth: "48px", textAlign: "center" }}>
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={() => setZoomScale((s) => Math.min(s + 0.25, 5))}
              disabled={zoomScale >= 5}
              style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#111120", border: "1px solid #1a1a2a", color: zoomScale >= 5 ? "#374151" : "#e2e8f0", fontSize: "16px", cursor: zoomScale >= 5 ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >+</button>
            <button
              onClick={() => { setZoomScale(1); setPan({ x: 0, y: 0 }); }}
              disabled={zoomScale === 1 && pan.x === 0 && pan.y === 0}
              style={{ padding: "0 12px", height: "32px", borderRadius: "999px", background: "#111120", border: "1px solid #1a1a2a", color: (zoomScale === 1 && pan.x === 0 && pan.y === 0) ? "#374151" : "#9ca3af", fontSize: "11px", fontWeight: 600, cursor: (zoomScale === 1 && pan.x === 0 && pan.y === 0) ? "not-allowed" : "pointer" }}
            >Reset</button>
          </div>

          <button
            onClick={closeZoom}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: "20px", right: "20px",
              width: "44px", height: "44px", borderRadius: "50%",
              background: "#0e0e18", border: "1px solid #3b82f6",
              color: "#e2e8f0", fontSize: "22px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 20px rgba(0,0,0,0.6)",
            }}
            title="Close"
          >×</button>

          <div style={{
            position: "absolute", top: "26px", left: "50%", transform: "translateX(-50%)",
            fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace",
            pointerEvents: "none", userSelect: "none",
          }}>
            scroll to zoom · drag to pan · click × to close
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}