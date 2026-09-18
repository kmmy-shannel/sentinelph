// apps/web/src/components/Sidebar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import apiClient from '../lib/api';

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

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [badges, setBadges] = useState({});
  const navigate = useNavigate();
  const location = useLocation();

  const loadBadges = useCallback(async () => {
    if (!role) return;
    try {
      const { data } = await apiClient.get('/api/v1/stats/badges');
      setBadges(data?.data ?? {});
    } catch (err) {
      console.warn('[Sidebar] badge fetch failed:', err?.message);
    }
  }, [role]);

  useEffect(() => {
    loadBadges();
  }, [loadBadges, location.pathname]);

  function confirmLogout() {
    setShowLogoutConfirm(false);
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
  }

  const roleColor =
    role === ROLES.OFFICER ? "#3b82f6" :
    role === ROLES.ADMIN ? "#a855f7" :
    role === ROLES.SUPERADMIN ? "#22c55e" :
    "#3b82f6";

  const getNavItems = () => {
    if (role === ROLES.OFFICER) {
      return [
        { id: "dashboard", label: "Dashboard", Icon: DashboardIcon, to: "/officer/dashboard" },
        { id: "queue", label: "Review Queue", Icon: QueueIcon, badge: badges.reviewQueue, to: "/officer/queue" },
        { id: "registry", label: "Blacklist Registry", Icon: RegistryIcon, to: "/officer/registry" },
        { id: "notifications", label: "Notifications", Icon: NotificationsIcon, to: "/officer/notifications" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/officer/account" },
      ];
    } else if (role === ROLES.ADMIN) {
      return [
        { id: "dashboard", label: "Dashboard", Icon: DashboardIcon, to: "/admin/dashboard" },
        { id: "officers", label: "Officers", Icon: QueueIcon, badge: badges.officers, to: "/admin/officers" },
        { id: "model", label: "AI Insights", Icon: RegistryIcon, to: "/admin/model" },
        { id: "reports", label: "Analytics & Reports", Icon: NotificationsIcon, to: "/admin/reports" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/admin/account" },
      ];
    } else if (role === ROLES.SUPERADMIN) {
      return [
        { id: "dashboard", label: "Dashboard", Icon: DashboardIcon, to: "/superadmin/dashboard" },
        { id: "users-rbac", label: "Users & RBAC", Icon: QueueIcon, badge: badges.usersRbac, to: "/superadmin/users-rbac" },
        { id: "chain-integrity", label: "Chain Integrity", Icon: RegistryIcon, to: "/superadmin/chain-integrity" },
        { id: "audit-logs", label: "Audit Logs", Icon: NotificationsIcon, badge: badges.auditLogs, to: "/superadmin/audit-logs" },
        { id: "system-health", label: "System Health", Icon: AccountIcon, to: "/superadmin/system-health" },
        { id: "account", label: "Account", Icon: AccountIcon, to: "/superadmin/account" },
      ];
    }
    return [];
  };

  const NAV = getNavItems();

  return (
    <>
      <aside
        className={`sentinel-sidebar ${isOpen ? 'open' : ''}`}
        style={{
          background: "#080810",
          borderRight: "1px solid #13131e",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "16px", borderBottom: "1px solid #0f0f1a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "12px", color: "#fff", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", flexShrink: 0 }}>S</div>
            <div>
              <div style={{ fontWeight: 800, color: "#fff", fontSize: "12px" }}>SentinelPH</div>
              <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>CONTROL CENTER</div>
            </div>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "8px", background: `${roleColor}12`, border: `1px solid ${roleColor}25` }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
            <span style={{ fontSize: "10px", fontWeight: 700, color: roleColor, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.05em" }}>
              {role === ROLES.OFFICER ? "NBI CCRU" : role === ROLES.ADMIN ? "AGENCY ADMIN" : "SUPER ADMIN"}
            </span>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "4px 12px", overflowY: "auto" }}>
          {NAV.map(item => (
            <NavLink
              key={item.id}
              to={item.to}
              onClick={() => {
                setActiveTab(item.id);
                if (onClose) onClose();
              }}
              style={({ isActive }) => ({
                width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", marginBottom: "2px",
                background: isActive || activeTab === item.id ? `${roleColor}18` : "transparent",
                border: isActive || activeTab === item.id ? `1px solid ${roleColor}30` : "1px solid transparent",
                textDecoration: "none", cursor: "pointer", transition: "all 0.2s ease",
              })}
            >
              <item.Icon color={activeTab === item.id ? roleColor : "#4b5563"} />
              <span style={{ flex: 1, fontSize: "12px", fontWeight: activeTab === item.id ? 600 : 500, color: activeTab === item.id ? "#fff" : "#6b7280", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
              {item.badge > 0 && (
                <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 5px", borderRadius: "999px", background: "#ef4444", color: "#fff", minWidth: "18px", textAlign: "center" }}>
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: "12px", borderTop: "1px solid #0f0f1a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, flexShrink: 0, background: `${roleColor}25`, color: roleColor, border: `1px solid ${roleColor}40` }}>{user?.initials ?? "SA"}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "Platform Admin"}</div>
              <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email ?? "admin@sentinelph.gov.ph"}</div>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#374151", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.querySelector('svg').style.stroke = "#ef4444"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#374151"; e.currentTarget.querySelector('svg').style.stroke = "#374151"; }}
          >
            <LogoutIcon color="#374151" /> Sign out →
          </button>
        </div>

        <style>{`
          .sentinel-sidebar {
            width: 220px;
            height: 100vh;
            flex-shrink: 0;
          }
          .sidebar-close-btn {
            display: none;
            color: #4b5563;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
          }
          @media (max-width: 1024px) {
            .sentinel-sidebar {
              position: fixed;
              top: 0;
              left: 0;
              z-index: 50;
              height: 100vh;
              transform: translateX(-100%);
              transition: transform 0.3s ease;
              width: 260px;
              box-shadow: 4px 0 24px rgba(0,0,0,0.5);
            }
            .sentinel-sidebar.open {
              transform: translateX(0);
            }
            .sidebar-close-btn {
              display: flex;
            }
          }
        `}</style>
      </aside>

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "400px", margin: "0 16px", borderRadius: "20px", padding: "28px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#ef4444,transparent)" }} />

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#ef444415", border: "1px solid #ef444430", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LogoutIcon color="#ef4444" />
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                Sign Out?
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>
                You'll be returned to the login screen. Make sure you've saved any work in progress.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#ef4444", border: "none", color: "#fff", cursor: "pointer" }}
              >
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}