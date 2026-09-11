// apps/web/src/pages/Analyst-Tabs/AIModelInsights.jsx
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const METRICS = [
  { l: "ACCURACY",   v: 87.4, target: 85, color: "#3b82f6" },
  { l: "PRECISION",  v: 88.2, target: 85, color: "#a855f7" },
  { l: "RECALL",     v: 86.5, target: 85, color: "#22c55e" },
  { l: "F1 SCORE",   v: 87.3, target: 85, color: "#f59e0b" },
];

const accuracyData = [
  { date: "Aug 1",  acc: 85,   prec: 85.5, recall: 84.5, f1: 85.2 },
  { date: "Aug 5",  acc: 85.5, prec: 86,   recall: 85,   f1: 85.6 },
  { date: "Aug 9",  acc: 86,   prec: 86.5, recall: 85.5, f1: 86.2 },
  { date: "Aug 13", acc: 86.5, prec: 87,   recall: 86,   f1: 86.8 },
  { date: "Aug 17", acc: 87,   prec: 87.5, recall: 86.5, f1: 87.2 },
  { date: "Aug 21", acc: 87.2, prec: 88,   recall: 86.2, f1: 87.4 },
  { date: "Aug 25", acc: 87.4, prec: 88.2, recall: 86.5, f1: 87.3 },
];

const INITIAL_FLAGGED = [
  { id: "FL-04411", number: "+63 921 334 5510", label: "OTP Phishing",       conf: "94.2%", confC: "#22c55e", status: "Pending" },
  { id: "FL-04408", number: "+63 908 771 2230", label: "Bank Impersonation", conf: "79.1%", confC: "#f59e0b", status: "Approved" },
  { id: "FL-04401", number: "+63 933 445 8810", label: "Investment Scam",    conf: "68.4%", confC: "#ef4444", status: "Pending" },
  { id: "FL-04397", number: "+63 917 882 1104", label: "Parcel/Delivery",    conf: "91.8%", confC: "#22c55e", status: "Approved" },
  { id: "FL-04390", number: "+63 945 223 7710", label: "Gov't Impersonation",conf: "73.5%", confC: "#f59e0b", status: "Pending" },
  { id: "FL-04381", number: "+63 912 667 3380", label: "OTP Phishing",       conf: "88.0%", confC: "#22c55e", status: "Approved" },
];

const CATEGORIES = [
  "OTP Phishing", "Bank Impersonation", "Parcel/Delivery",
  "Investment Scam", "Gov't Impersonation", "Unknown"
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function AIModelInsights() {
  const [flagged, setFlagged] = useState(INITIAL_FLAGGED);
  const [classifyModal, setClassifyModal] = useState(null);
  const [selectedLabel, setSelectedLabel] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  function openClassify(row) {
    setClassifyModal(row);
    setSelectedLabel(row.label);
  }

  function closeClassify() {
    setClassifyModal(null);
    setSelectedLabel("");
  }

  function handleSubmitClassification() {
    if (!selectedLabel) return;
    setFlagged(prev =>
      prev.map(f =>
        f.id === classifyModal.id
          ? { ...f, label: selectedLabel, status: "Approved" }
          : f
      )
    );
    closeClassify();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Metric Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px" }}>
        {METRICS.map((m) => (
          <div key={m.l} style={card}>
            <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.07em" }}>{m.l}</div>
            <div style={{ fontSize: "30px", fontWeight: 800, color: "#fff", marginBottom: "12px", fontFamily: "'JetBrains Mono',monospace" }}>{m.v}%</div>
            <div style={{ height: "4px", borderRadius: "999px", background: "#13131e", marginBottom: "6px" }}>
              <div style={{ height: "100%", borderRadius: "999px", width: `${m.v}%`, background: m.color }} />
            </div>
            <div style={{ fontSize: "11px", color: "#4b5563" }}>Target: ≥{m.target}%</div>
          </div>
        ))}
      </div>

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          Classification submitted successfully.
        </div>
      )}

      {/* 30-Day Rolling Accuracy Graph */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>30-Day Rolling Accuracy</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>Accuracy, Precision, Recall over time · Target: 85% minimum</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={accuracyData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#13131e" />
            <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[82, 90]} tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#111120", border: "1px solid #1a1a2a", borderRadius: "8px", color: "#e2e8f0", fontSize: 12 }} />
            <Line type="monotone" dataKey="acc" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="prec" stroke="#a855f7" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="recall" stroke="#22c55e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="f1" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Flagged for Human Classification */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Flagged for Human Classification</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>{flagged.filter(f => f.status === "Pending").length} reports awaiting classification — feeds retraining feedback loop</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["FLAG ID", "NUMBER", "AI LABEL", "CONFIDENCE", "STATUS", "ACTION"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {flagged.map(f => (
              <tr key={f.id}>
                <td style={{ ...tdS, color: "#3b82f6", fontFamily: "'JetBrains Mono',monospace" }}>{f.id}</td>
                <td style={{ ...tdS, color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{f.number}</td>
                <td style={{ ...tdS, color: "#9ca3af" }}>{f.label}</td>
                <td style={{ ...tdS, fontWeight: 600, color: f.confC, fontFamily: "'JetBrains Mono',monospace" }}>{f.conf}</td>
                <td style={tdS}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: f.status === "Pending" ? "#f59e0b" : "#22c55e" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: f.status === "Pending" ? "#f59e0b" : "#22c55e", display: "inline-block" }} />
                    {f.status}
                  </span>
                </td>
                <td style={tdS}>
                  {f.status === "Pending" ? (
                    <button onClick={() => openClassify(f)} style={{ fontSize: "11px", fontWeight: 600, color: "#a855f7", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Classify →</button>
                  ) : (
                    <span style={{ fontSize: "11px", color: "#374151" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Classify Modal */}
      {classifyModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "480px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#a855f7,transparent)" }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px" }}>Classify {classifyModal.id}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#4b5563" }}>{classifyModal.number} · AI Label: {classifyModal.label} ({classifyModal.conf})</div>
              </div>
              <button onClick={closeClassify} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>SELECT CORRECT CATEGORY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setSelectedLabel(cat)}
                    style={{
                      padding: "12px 16px", borderRadius: "10px", fontSize: "13px", textAlign: "left", cursor: "pointer",
                      background: selectedLabel === cat ? "#a855f720" : "#111118",
                      border: selectedLabel === cat ? "1.5px solid #a855f7" : "1.5px solid #1a1a28",
                      color: selectedLabel === cat ? "#fff" : "#9ca3af",
                      fontWeight: selectedLabel === cat ? 600 : 500,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                    {cat}
                    {selectedLabel === cat && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <button disabled={!selectedLabel} onClick={handleSubmitClassification}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 700, border: "none", background: selectedLabel ? "#a855f7" : "#111118", color: selectedLabel ? "#fff" : "#374151", cursor: selectedLabel ? "pointer" : "not-allowed" }}>
              Submit Classification
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