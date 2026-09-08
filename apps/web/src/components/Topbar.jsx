// apps/web/src/components/Topbar.jsx
import React from 'react';
import { useAuth, ROLES } from '../context/AuthContext';

export default function Topbar() {
  const { role } = useAuth();

  const getTitle = () => {
    if (role === ROLES.OFFICER) return "Jurisdiction Dashboard — NCR";
    if (role === ROLES.ANALYST) return "Scam Pattern Analytics";
    if (role === ROLES.AUDITOR) return "Audit Log Viewer";
    return "Dashboard";
  };

  return (
    <div style={{ 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "space-between", 
      padding: "12px 24px", 
      borderBottom: "1px solid #13131e", 
      flexShrink: 0,
      background: "#09090f"
    }}>
      <div>
        <div style={{ fontWeight: 700, color: "#fff", fontSize: "14px" }}>{getTitle()}</div>
        <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563" }}>August 28, 2026 · PH Standard Time 09:22</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>Live Data</span>
      </div>
    </div>
  );
}