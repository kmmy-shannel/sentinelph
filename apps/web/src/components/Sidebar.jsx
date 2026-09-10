// apps/web/src/components/Sidebar.jsx
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';

const DashboardIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);

const QueueIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M9 12h6M9 16h4" />
  </svg>
);

const RegistryIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const NotificationsIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const AccountIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const LogoutIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default function Sidebar() {
  const { user, role, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const navigate = useNavigate();

  const handleLogout = async () => {
    document.body.style.transition = "opacity 0.3s ease";
    document.body.style.opacity = "0";
    setTimeout(() => {
      logout();
      navigate('/login');
      setTimeout(() => {
        document.body.style.transition = "none";
        document.body.style.opacity = "1";
      }, 50);
    }, 300);
  };

  const roleColor = 
    role === ROLES.OFFICER ? "#3b82f6" : 
    role === ROLES.ANALYST ? "#a855f7" : 
    role === ROLES.AUDITOR ? "#22c55e" : 
    "#3b82f6";

  const getNavItems = () => {
    if (role === ROLES.OFFICER) {
      return [
        { id: "dashboard", label: "Dashboard", Icon: DashboardIcon, to: "/officer/dashboard" },
        { id: "queue", label: "Review Queue", Icon: QueueIcon, badge: 14, to: "/officer/queue" },
        { id: "registry", label: "Blacklist Registry", Icon: RegistryIcon, to: "/officer/registry" },
        { id: "notifications", label: "Notifications", Icon: NotificationsIcon, badge: 3, to: "/officer/notifications" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/officer/account" },
      ];
    } else if (role === ROLES.ANALYST) {
      return [
        { id: "dashboard", label: "Trends Dashboard", Icon: DashboardIcon, to: "/analyst/dashboard" },
        { id: "patterns", label: "Pattern Explorer", Icon: QueueIcon, to: "/analyst/patterns" },
        { id: "model", label: "AI Model Insights", Icon: RegistryIcon, to: "/analyst/model" },
        { id: "reports", label: "Regional Reports", Icon: NotificationsIcon, to: "/analyst/reports" },
        { id: "alerts", label: "Alerts Configuration", Icon: AccountIcon, to: "/analyst/alerts" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/analyst/account" },
      ];
    } else if (role === ROLES.AUDITOR) {
      return [
        { id: "dashboard", label: "Dashboard", Icon: DashboardIcon, to: "/auditor/dashboard" },
        { id: "verify", label: "Verification Tool", Icon: QueueIcon, to: "/auditor/verify" },
        { id: "trail", label: "Audit Trail", Icon: RegistryIcon, to: "/auditor/trail" },
        { id: "anomalies", label: "Anomaly Reports", Icon: NotificationsIcon, to: "/auditor/anomalies" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/auditor/account" },
      ];
    }
    return [];
  };

  const NAV = getNavItems();

  return (
    <aside style={{ width: "220px", flexShrink: 0, height: "100%", display: "flex", flexDirection: "column", background: "#080810", borderRight: "1px solid #13131e" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px", borderBottom: "1px solid #0f0f1a" }}>
        <div style={{ width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "12px", color: "#fff", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", flexShrink: 0 }}>S</div>
        <div>
          <div style={{ fontWeight: 800, color: "#fff", fontSize: "12px" }}>SentinelPH</div>
          <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>CONTROL CENTER</div>
        </div>
      </div>
      
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "8px", background: `${roleColor}12`, border: `1px solid ${roleColor}25` }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
          <span style={{ fontSize: "9px", fontWeight: 600, color: roleColor, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>
            {role === ROLES.OFFICER ? "NBI CCRU" : role === ROLES.ANALYST ? "NTC FRAUD DIV." : "SYSTEM AUDITOR"}
          </span>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "4px 12px", overflowY: "auto" }}>
        {NAV.map(item => (
          <NavLink
            key={item.id}
            to={item.to}
            onClick={() => setActiveTab(item.id)}
            style={({ isActive }) => ({
              width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", marginBottom: "2px", 
              background: isActive || activeTab === item.id ? `${roleColor}18` : "transparent", 
              border: isActive || activeTab === item.id ? `1px solid ${roleColor}30` : "1px solid transparent", 
              textDecoration: "none", cursor: "pointer", transition: "all 0.2s ease",
            })}
          >
            <item.Icon color={activeTab === item.id ? roleColor : "#4b5563"} />
            <span style={{ flex: 1, fontSize: "12px", fontWeight: activeTab === item.id ? 600 : 500, color: activeTab === item.id ? "#fff" : "#6b7280", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
            {item.badge && <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 5px", borderRadius: "999px", background: "#ef4444", color: "#fff", minWidth: "18px", textAlign: "center" }}>{item.badge}</span>}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: "12px", borderTop: "1px solid #0f0f1a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, flexShrink: 0, background: `${roleColor}25`, color: roleColor, border: `1px solid ${roleColor}40` }}>{user?.initials ?? "RC"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "Insp. R. Cruz"}</div>
            <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email ?? "r.cruz@nbi.gov.ph"}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#374151", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.querySelector('svg').style.stroke = "#ef4444"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#374151"; e.currentTarget.querySelector('svg').style.stroke = "#374151"; }}>
          <LogoutIcon color="#374151" /> Sign out →
        </button>
      </div>
    </aside>
  );
}