// src/pages/Officer-Tabs/Notifications.jsx
import { Bell, ShieldCheck, AlertTriangle, Info } from 'lucide-react';

const NOTIFS = [
  { id: 1, type: "urgent", title: "Second approval needed — RPT-09415", body: "+63 956 774 3390 (Investment Scam) has 1 of 2 required votes. Your approval will finalize the blacklist entry.", time: "09:18", unread: true },
  { id: 2, type: "info",   title: "48 reports in — RPT-09421",          body: "A new high-volume report cluster has been submitted for +63 917 823 4411 (OTP Phishing) in your jurisdiction.", time: "09:14", unread: true },
  { id: 3, type: "system", title: "Nightly integrity check passed",      body: "The automated blockchain hash-chain verification for Aug 27 completed successfully. 1,204,881 blocks verified, 0 discrepancies.", time: "08:00", unread: true },
  { id: 4, type: "urgent", title: "Second approval needed — RPT-09381", body: "+63 927 445 1182 (OTP Phishing) has been waiting for a second vote for 19 hours.", time: "Aug 27 14:22", unread: false },
  { id: 5, type: "info",   title: "34 reports in — RPT-09388",          body: "New report cluster for +63 933 112 8890 (Parcel/Delivery) in NCR. Assigned to your queue.", time: "Aug 27 14:10", unread: false },
  { id: 6, type: "system", title: "System maintenance window",           body: "Scheduled maintenance on Aug 29, 2026 02:00–04:00 PST. The system will be in read-only mode during this window.", time: "Aug 27 09:00", unread: false },
];

const TYPE_ICON = {
  urgent: <AlertTriangle size={16} color="#f59e0b" />,
  info: <Info size={16} color="#3b82f6" />,
  system: <ShieldCheck size={16} color="#6b7280" />
};

export default function Notifications() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#4b5563" }}>3 unread notifications</span>
        <button style={{ fontSize: "12px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer" }}>Mark all as read</button>
      </div>
      {NOTIFS.map((n) => (
        <div key={n.id} style={{ display: "flex", gap: "16px", padding: "16px", borderRadius: "12px", cursor: "pointer", background: n.unread ? "#0f0f1c" : "#0a0a12", border: `1px solid ${n.unread ? "#1e1e30" : "#13131e"}` }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
          onMouseLeave={(e) => e.currentTarget.style.background = n.unread ? "#0f0f1c" : "#0a0a12"}>
          <span style={{ marginTop: "2px", flexShrink: 0 }}>{TYPE_ICON[n.type]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "#fff", opacity: n.unread ? 1 : 0.6 }}>{n.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                {n.unread && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />}
                <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{n.time}</span>
              </div>
            </div>
            <p style={{ fontSize: "12px", marginTop: "4px", lineHeight: 1.6, color: n.unread ? "#6b7280" : "#374151" }}>{n.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}