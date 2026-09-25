// apps/web/src/components/Topbar.jsx
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function formatPHTime(date) {
  // en-PH locale with Asia/Manila timezone (PST, UTC+8)
  const datePart = date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const timePart = date.toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return `${datePart} · PH Standard Time ${timePart}`;
}

export default function Topbar({ onMenuClick }) {
  const location = useLocation();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Tick every second so the clock stays in sync.
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const getTitle = () => {
    const path = location.pathname;

    if (path === "/officer/dashboard") return "Jurisdiction Dashboard — NCR";
    if (path === "/officer/queue") return "Review Queue";
    if (path === "/officer/registry") return "Blacklist Registry";
    if (path === "/officer/notifications") return "Notifications";
    if (path === "/officer/account") return "Account";

    if (path === "/admin/dashboard") return "Agency Admin Dashboard";
    if (path === "/admin/officers") return "Officers";
    if (path === "/admin/model") return "AI Model Insights";
    if (path === "/admin/reports") return "Analytics & Reports";
    if (path === "/admin/account") return "Account";

    if (path === "/superadmin/dashboard") return "Platform Dashboard";
    if (path === "/superadmin/users-rbac") return "Users & RBAC";
    if (path === "/superadmin/chain-integrity") return "Chain Integrity";
    if (path === "/superadmin/audit-logs") return "Audit Logs";
    if (path === "/superadmin/system-health") return "System Health";
    if (path === "/superadmin/account") return "Account";

    return "Dashboard";
  };

  return (
    <div
      className="topbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid #13131e",
        flexShrink: 0,
        background: "#09090f",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: 1 }}>
        <button
          className="topbar-menu-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
          type="button"
        >
          <HamburgerIcon />
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontWeight: 700,
              color: "#fff",
              fontSize: "14px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {getTitle()}
          </div>
          <div
            className="topbar-subtitle"
            style={{
              fontSize: "12px",
              marginTop: "2px",
              color: "#4b5563",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatPHTime(now)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        <span
          className="topbar-live-label"
          style={{
            fontSize: "11px",
            color: "#4b5563",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          Live Data
        </span>
      </div>

      <style>{`
        .topbar-menu-btn { display: none; }

        @media (max-width: 1024px) {
          .topbar-menu-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: rgba(148,163,184,0.06);
            border: 1px solid rgba(148,163,184,0.1);
            color: #94a3b8;
            cursor: pointer;
            flex-shrink: 0;
            padding: 0;
          }
          .topbar-menu-btn:hover {
            background: rgba(148,163,184,0.12);
            color: #e2e8f0;
          }
        }

        @media (max-width: 640px) {
          .topbar {
            padding: 10px 14px !important;
          }
          .topbar-subtitle {
            display: none;
          }
          .topbar-live-label {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}