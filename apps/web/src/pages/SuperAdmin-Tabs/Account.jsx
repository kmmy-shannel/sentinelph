// apps/web/src/pages/SuperAdmin-Tabs/Account.jsx
import React from "react";
import { useAuth } from "../../context/AuthContext";

const A = "#22c55e";
const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "24px", maxWidth: "640px" };
const label = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };

export default function Account() {
  const { user, role, logout } = useAuth();

  return (
    <div style={card}>
      <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>Super Admin Account</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 24px", marginBottom: "24px" }}>
        <div>
          <div style={label}>DISPLAY NAME</div>
          <div style={{ fontSize: "13px", color: "#fff" }}>{user?.name ?? "Platform Admin"}</div>
        </div>
        <div>
          <div style={label}>EMAIL</div>
          <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{user?.email ?? "admin@sentinelph.gov.ph"}</div>
        </div>
        <div>
          <div style={label}>ROLE</div>
          <div style={{ fontSize: "13px", color: A, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{(role ?? "superadmin").toUpperCase()}</div>
        </div>
        <div>
          <div style={label}>USER ID</div>
          <div style={{ fontSize: "13px", color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{user?.uid ?? "—"}</div>
        </div>
      </div>

      <button onClick={logout}
        style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#3f1a1a", border: "1px solid #ef444440", color: "#ef4444", cursor: "pointer" }}>
        Sign Out
      </button>
    </div>
  );
}