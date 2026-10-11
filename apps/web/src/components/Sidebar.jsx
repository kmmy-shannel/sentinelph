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

const PersonIcon = ({ size = 16, color = '#ffffff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
  </svg>
);

const ChevronIcon = ({ color = '#e2e8f0', size = 16, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <polyline points="14 6 8 12 14 18" />
  </svg>
);

const COLLAPSE_KEY = 'sentinelph.sidebar.collapsed';

// Longest-prefix match — /officer/queue/anything still highlights "queue",
// and one and only one tab is ever highlighted.
function getActiveId(pathname, items) {
  if (!items.length) return null;
  const matches = items
    .filter(item => pathname === item.to || pathname.startsWith(item.to + '/'))
    .sort((a, b) => b.to.length - a.to.length);
  return matches[0]?.id ?? null;
}

export default function Sidebar({ isOpen, onClose }) {
  const { user, role, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [badges, setBadges] = useState({});
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [hoverChevron, setHoverChevron] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

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
    const interval = setInterval(loadBadges, 30000);
    return () => clearInterval(interval);
  }, [loadBadges, location.pathname]);

  const clearBadgeLocally = useCallback((key) => {
    setBadges(prev => ({ ...prev, [key]: 0 }));
  }, []);

  useEffect(() => {
    window.__clearSidebarBadge = clearBadgeLocally;
    return () => { delete window.__clearSidebarBadge; };
  }, [clearBadgeLocally]);

  useEffect(() => {
    const handler = () => loadBadges();
    window.addEventListener('badges:refresh', handler);
    return () => window.removeEventListener('badges:refresh', handler);
  }, [loadBadges]);

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
        { id: "dashboard",     label: "Dashboard",          Icon: DashboardIcon,     to: "/officer/dashboard" },
        { id: "queue",         label: "Review Queue",       Icon: QueueIcon,         badge: badges.reviewQueue, to: "/officer/queue" },
        { id: "registry",      label: "Blacklist Registry", Icon: RegistryIcon,      badge: badges.registry,    to: "/officer/registry" },
        { id: "notifications", label: "Notifications",      Icon: NotificationsIcon, badge: badges.notifications, to: "/officer/notifications" },
        { id: "account",       label: "Account",            Icon: AccountIcon,       to: "/officer/account" },
      ];
    } else if (role === ROLES.ADMIN) {
      return [
        { id: "dashboard", label: "Dashboard",           Icon: DashboardIcon,     to: "/admin/dashboard" },
        { id: "officers",  label: "Officers",            Icon: QueueIcon,         badge: badges.officers, to: "/admin/officers" },
        { id: "model",     label: "AI Insights",         Icon: RegistryIcon,      to: "/admin/model" },
        { id: "reports",   label: "Analytics & Reports", Icon: NotificationsIcon, to: "/admin/reports" },
        { id: "account",   label: "Account",             Icon: AccountIcon,       to: "/admin/account" },
      ];
    } else if (role === ROLES.SUPERADMIN) {
      return [
        { id: "dashboard",       label: "Dashboard",       Icon: DashboardIcon,     to: "/superadmin/dashboard" },
        { id: "users-rbac",      label: "Users & RBAC",    Icon: QueueIcon,         badge: badges.usersRbac, to: "/superadmin/users-rbac" },
        { id: "chain-integrity", label: "Chain Integrity", Icon: RegistryIcon,      to: "/superadmin/chain-integrity" },
        { id: "audit-logs",      label: "Audit Logs",      Icon: NotificationsIcon, badge: badges.auditLogs, to: "/superadmin/audit-logs" },
        { id: "system-health",   label: "System Health",   Icon: AccountIcon,       to: "/superadmin/system-health" },
        { id: "account",         label: "Account",         Icon: AccountIcon,       to: "/superadmin/account" },
      ];
    }
    return [];
  };

  const NAV = getNavItems();
  const activeId = getActiveId(location.pathname, NAV);

  return (
    <>
      <aside
        className={`sentinel-sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        style={{
          background: "#080810",
          borderRight: "1px solid #13131e",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "visible",
        }}
      >
        {/* Logo header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: collapsed ? "18px 8px" : "18px 16px", borderBottom: "1px solid #0f0f1a", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <img
              src="/logo.png"
              alt="SentinelPH"
              style={{ width: "40px", height: "40px", objectFit: "contain", flexShrink: 0 }}
            />
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: "#fff", fontSize: "16px", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>SentinelPH</div>
                <div style={{ fontSize: "9px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em", marginTop: "2px", whiteSpace: "nowrap" }}>CONTROL CENTER</div>
              </div>
            )}
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu" style={{ display: 'none' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Collapse chevron */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setCollapsed(v => !v)}
          onMouseEnter={() => setHoverChevron(true)}
          onMouseLeave={() => setHoverChevron(false)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            position: 'absolute',
            top: '50%',
            right: '-14px',
            transform: 'translateY(-50%)',
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: hoverChevron ? '#14141f' : '#0e0e18',
            border: `1px solid ${hoverChevron ? '#3b82f6' : '#1a1a2a'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 20,
            padding: 0,
            boxShadow: hoverChevron ? '0 0 0 4px rgba(59,130,246,0.08)' : '0 2px 6px rgba(0,0,0,0.4)',
            transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <ChevronIcon
            size={16}
            color={hoverChevron ? '#3b82f6' : '#94a3b8'}
            style={{
              transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s ease',
              transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        {/* Role chip */}
        <div style={{ padding: collapsed ? "10px 8px" : "10px 12px", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "6px", padding: "6px 10px", borderRadius: "8px", background: `${roleColor}12`, border: `1px solid ${roleColor}25` }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
            {!collapsed && (
              <span style={{ fontSize: "10px", fontWeight: 700, color: roleColor, fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                {role === ROLES.OFFICER ? "OFFICER" : role === ROLES.ADMIN ? "AGENCY ADMIN" : "SUPER ADMIN"}
              </span>
            )}
          </div>
        </div>

        <nav style={{ flex: 1, padding: collapsed ? "4px 8px" : "4px 12px", overflowY: "auto", overflowX: "hidden" }}>
          {NAV.map(item => {
            const isActive = activeId === item.id;
            return (
              <NavLink
                key={item.id}
                to={item.to}
                onClick={() => { if (onClose) onClose(); }}
                title={collapsed ? item.label : undefined}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: collapsed ? "center" : "flex-start",
                  gap: "10px", padding: "10px 12px", borderRadius: "8px", marginBottom: "2px",
                  background: isActive ? `${roleColor}18` : "transparent",
                  border: isActive ? `1px solid ${roleColor}30` : "1px solid transparent",
                  textDecoration: "none", cursor: "pointer", transition: "background 0.2s ease, border-color 0.2s ease",
                  position: "relative",
                  minHeight: "40px",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "20px", flexShrink: 0 }}>
                  <item.Icon color={isActive ? roleColor : "#4b5563"} />
                </span>
                {!collapsed && (
                  <span style={{ flex: 1, fontSize: "12px", fontWeight: isActive ? 600 : 500, color: isActive ? "#fff" : "#6b7280", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
                )}
                {!collapsed && item.badge > 0 && (
                  <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 5px", borderRadius: "999px", background: "#ef4444", color: "#fff", minWidth: "18px", textAlign: "center" }}>
                    {item.badge}
                  </span>
                )}
                {collapsed && item.badge > 0 && (
                  <span style={{ position: "absolute", top: "6px", right: "6px", fontSize: "9px", fontWeight: 700, padding: "1px 4px", borderRadius: "999px", background: "#ef4444", color: "#fff", minWidth: "14px", textAlign: "center" }}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div style={{ padding: collapsed ? "12px 8px" : "12px", borderTop: "1px solid #0f0f1a", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start", gap: "10px", marginBottom: collapsed ? 0 : "8px" }}>
            <div
              style={{
                width: "32px", height: "32px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, background: `${roleColor}20`, border: `1px solid ${roleColor}40`,
              }}
              title={collapsed ? `${user?.name ?? 'User'} · ${user?.email ?? ''}` : undefined}
              aria-hidden="true"
            >
              <PersonIcon size={18} color={roleColor} />
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name ?? "Platform Admin"}</div>
                <div style={{ fontSize: "9px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.email ?? "admin@sentinelph.gov.ph"}</div>
              </div>
            )}
          </div>
          {!collapsed && (
            <button onClick={() => setShowLogoutConfirm(true)}
              style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#374151", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.querySelector('svg').style.stroke = "#ef4444"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#374151"; e.currentTarget.querySelector('svg').style.stroke = "#374151"; }}>
              <LogoutIcon color="#374151" /> Sign out
            </button>
          )}
        </div>

        <style>{`
          .sentinel-sidebar {
            width: 240px;
            height: 100vh;
            flex-shrink: 0;
            transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            will-change: width;
          }
          .sentinel-sidebar.collapsed {
            width: 64px;
          }
          .sidebar-close-btn { display: none; color: #4b5563; background: none; border: none; cursor: pointer; padding: 0; }
          @media (max-width: 1024px) {
            .sentinel-sidebar { position: fixed; top: 0; left: 0; z-index: 50; height: 100vh; transform: translateX(-100%); transition: transform 0.3s ease; width: 260px; box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
            .sentinel-sidebar.open { transform: translateX(0); }
            .sentinel-sidebar.collapsed { width: 260px; }
            .sidebar-close-btn { display: flex; }
            .sidebar-collapse-btn { display: none !important; }
          }
        `}</style>
      </aside>

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
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Sign Out?</div>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>You'll be returned to the login screen. Make sure you've saved any work in progress.</div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowLogoutConfirm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmLogout}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#ef4444", border: "none", color: "#fff", cursor: "pointer" }}>
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}