// apps/web/src/pages/Analyst-Tabs/AIModelInsights.jsx
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

const FLAGGED = [
  { id: "FL-04411", number: "+63 921 334 5510", label: "OTP Phishing",       conf: "94.2%", confC: "#22c55e", status: "Pending" },
  { id: "FL-04408", number: "+63 908 771 2230", label: "Bank Impersonation", conf: "79.1%", confC: "#f59e0b", status: "Approved" },
  { id: "FL-04401", number: "+63 933 445 8810", label: "Investment Scam",    conf: "68.4%", confC: "#ef4444", status: "Pending" },
  { id: "FL-04397", number: "+63 917 882 1104", label: "Parcel/Delivery",    conf: "91.8%", confC: "#22c55e", status: "Approved" },
  { id: "FL-04390", number: "+63 945 223 7710", label: "Gov't Impersonation",conf: "73.5%", confC: "#f59e0b", status: "Pending" },
  { id: "FL-04381", number: "+63 912 667 3380", label: "OTP Phishing",       conf: "88.0%", confC: "#22c55e", status: "Approved" },
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS = { padding: "10px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function AIModelInsights() {
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
            <Line dataKey="target" stroke="#ef4444" strokeDasharray="5 5" strokeWidth={1} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Flagged for Human Classification */}
      <div style={card}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Flagged for Human Classification</div>
        <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "16px" }}>4 reports awaiting classification — feeds retraining feedback loop</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["FLAG ID", "NUMBER", "AI LABEL", "CONFIDENCE", "STATUS"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {FLAGGED.map(f => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}