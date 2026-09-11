// apps/web/src/pages/Officer-Tabs/ReviewQueue.jsx
import { useState } from "react";

const CheckIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CloseIcon = ({ color }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const INITIAL_REPORTS = [
  { id: "RPT-09421", number: "+63 917 823 4411", type: "OTP Phishing",       reports: 48, channel: "SMS",  submitted: "Aug 28 09:14", priorVotes: "None",   status: "Pending" },
  { id: "RPT-09415", number: "+63 956 774 3390", type: "Investment Scam",    reports: 27, channel: "Call", submitted: "Aug 28 07:30", priorVotes: "1 vote", status: "Pending" },
  { id: "RPT-09402", number: "+63 920 445 7721", type: "OTP Phishing",       reports: 18, channel: "SMS",  submitted: "Aug 27 19:30", priorVotes: "None",   status: "Pending" },
  { id: "RPT-09388", number: "+63 933 112 8890", type: "Parcel/Delivery",    reports: 34, channel: "SMS",  submitted: "Aug 27 14:10", priorVotes: "None",   status: "Pending" },
  { id: "RPT-09374", number: "+63 948 667 2201", type: "Bank Impersonation", reports: 56, channel: "Call", submitted: "Aug 27 10:55", priorVotes: "None",   status: "Pending" },
  { id: "RPT-09361", number: "+63 912 334 9980", type: "Gov't Impersonation",reports: 22, channel: "SMS",  submitted: "Aug 27 08:30", priorVotes: "None",   status: "Pending" },
  { id: "RPT-09347", number: "+63 927 884 5510", type: "OTP Phishing",       reports: 41, channel: "SMS",  submitted: "Aug 27 06:12", priorVotes: "None",   status: "Pending" },
];

export default function ReviewQueue() {
  const [tab, setTab] = useState("all");
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [voteModal, setVoteModal] = useState(null);
  const [decision, setDecision] = useState(null);
  const [comment, setComment] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const filtered = reports.filter((r) => {
    if (tab === "pending")   return r.status === "Pending";
    if (tab === "resolved")  return r.status !== "Pending";
    return true;
  });

  function closeModal() {
    setVoteModal(null);
    setDecision(null);
    setComment("");
  }

  function handleSubmitVote() {
    if (!decision || !comment.trim()) return;

    setReports(prev =>
      prev.map(r =>
        r.id === voteModal.id
          ? { ...r, status: decision === "approve" ? "Approved" : "Rejected" }
          : r
      )
    );

    closeModal();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "20px" }}>
        {[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending", count: reports.filter(r => r.status === "Pending").length },
          { id: "resolved", label: "Resolved" }
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", fontSize: "12px", fontWeight: 500, background: "none", border: "none", cursor: "pointer", borderBottom: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent", color: tab === t.id ? "#3b82f6" : "#4b5563" }}>
            {t.label}
            {t.count > 0 && <span style={{ padding: "1px 6px", borderRadius: "999px", fontSize: "9px", fontWeight: 700, background: "#ef4444", color: "#fff" }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {showSuccess && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <CheckIcon color="#22c55e" />
          Vote submitted successfully.
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
            {filtered.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #13131e" }}>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{row.id}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{row.number}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#9ca3af" }}>{row.type}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", fontWeight: 700, color: "#fff" }}>{row.reports}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280" }}>{row.channel}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{row.submitted}</td>
                <td style={{ padding: "12px 20px", fontSize: "12px", color: row.priorVotes === "1 vote" ? "#f59e0b" : "#4b5563" }}>{row.priorVotes}</td>
                <td style={{ padding: "12px 20px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: row.status === "Pending" ? "#f59e0b" : row.status === "Approved" ? "#22c55e" : "#ef4444" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: row.status === "Pending" ? "#f59e0b" : row.status === "Approved" ? "#22c55e" : "#ef4444", display: "inline-block" }} />
                    {row.status}
                  </span>
                </td>
                <td style={{ padding: "12px 20px" }}>
                  {row.status === "Pending" ? (
                    <button 
                      onClick={() => setVoteModal(row)}
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

      {/* Vote Modal - Click outside NO LONGER closes it */}
      {voteModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "480px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#3b82f6,transparent)" }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>{voteModal.id}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{voteModal.type} · {voteModal.channel} · {voteModal.reports} reports</div>
              </div>
              <button onClick={closeModal} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <CloseIcon color="#4b5563" />
              </button>
            </div>

            <div style={{ padding: "12px", borderRadius: "8px", marginBottom: "20px", background: "#080810", border: "1px solid #13131e" }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "#fff", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>{voteModal.number}</div>
              <div style={{ fontSize: "11px", color: "#4b5563" }}>Prior votes: {voteModal.priorVotes} · Submitted {voteModal.submitted}</div>
              <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: "#1e3a5f", color: "#60a5fa" }}>AI: likely_scam</span>
                <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", background: "#1a1a28", color: "#6b7280" }}>Confidence: 91.4%</span>
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

            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Mandatory: add your reasoning comment…" rows={3}
              style={{ width: "100%", padding: "12px 16px", borderRadius: "12px", fontSize: "12px", outline: "none", resize: "none", marginBottom: "16px", background: "#080810", border: "1px solid #1a1a28", color: "#e2e8f0", boxSizing: "border-box", fontFamily: "inherit" }} />

            <button 
              disabled={!decision || !comment.trim()} 
              onClick={handleSubmitVote}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: decision && comment.trim() ? "#3b82f6" : "#111118", color: decision && comment.trim() ? "#fff" : "#374151", cursor: decision && comment.trim() ? "pointer" : "not-allowed" }}>
              Submit Vote
            </button>
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