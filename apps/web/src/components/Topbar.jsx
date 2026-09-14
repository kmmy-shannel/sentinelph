// apps/web/src/components/Topbar.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';

export default function Topbar() {
  const location = useLocation();

  const getTitle = () => {
    const path = location.pathname;

    // Officer paths
    if (path === "/officer/dashboard") return "Jurisdiction Dashboard — NCR";
    if (path === "/officer/queue") return "Review Queue";
    if (path === "/officer/registry") return "Blacklist Registry";
    if (path === "/officer/notifications") return "Notifications";
    if (path === "/officer/account") return "Account";

    // Agency Admin paths
    if (path === "/admin/dashboard") return "Agency Admin Dashboard";
    if (path === "/admin/officers") return "Officers";
    if (path === "/admin/model") return "AI Model Insights";
    if (path === "/admin/reports") return "Analytics & Reports";
    if (path === "/admin/account") return "Account";

    // Super Admin paths
    if (path === "/superadmin/dashboard") return "Platform Dashboard";
    if (path === "/superadmin/users-rbac") return "Users & RBAC";
    if (path === "/superadmin/chain-integrity") return "Chain Integrity";
    if (path === "/superadmin/audit-logs") return "Audit Logs";
    if (path === "/superadmin/system-health") return "System Health";
    if (path === "/superadmin/account") return "Account";

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