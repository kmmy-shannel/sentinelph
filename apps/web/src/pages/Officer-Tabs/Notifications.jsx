// apps/web/src/pages/Officer-Tabs/Notifications.jsx
//
// Officer's personal notification feed.
//
// Backend contract (verified against routes/notifications.js):
//   GET /api/v1/notifications
//     → { success, data: [{ id, type, title, body, time, unread }], unreadCount }
//
// For the officer role, the backend only ever emits two types:
//   • type: 'urgent'  — a report in your jurisdiction needs your vote
//                        (IDs: 'oa-<reportId>' for one_approval,
//                               'ta-<reportId>' for two_approvals)
//   • type: 'info'    — a report in your jurisdiction was just blacklisted
//                        (ID: 'bl-<reportId>')
//
// The 'system' type is admin/superadmin-only and will never reach this page.
// The icon map below handles all three defensively, but only the first two
// are reachable for officers.
//
// Read state is derived server-side by diffing each notification ID against
// User.readNotificationIds[]. The client never computes unread state itself.
//
// Colors: aligned with the Officer-Tabs family (#0e0e18 card, #1a1a2a border,
// #111120 hover), with a type-colored left accent bar matching the
// ReviewQueue / BlacklistRegistry visual language.

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, AlertTriangle, Info } from "lucide-react";
import apiClient from "../../lib/api";

// ─── Icon + accent per type ──────────────────────────────────────────
// Accent colors match the icon colors so the left edge of each row
// telegraphs the notification category at a glance.
const TYPE_CONFIG = {
  urgent: {
    Icon: AlertTriangle,
    color: "#f59e0b",
    label: "Action Required",
  },
  info: {
    Icon: Info,
    color: "#3b82f6",
    label: "Update",
  },
  system: {
    Icon: ShieldCheck,
    color: "#6b7280",
    label: "System",
  },
};

// Fallback for any unexpected type from a future backend change.
const DEFAULT_TYPE = TYPE_CONFIG.info;

export default function Notifications() {
  const [notifs, setNotifs]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // ─── Load ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get("/api/v1/notifications");
      setNotifs(data?.data ?? []);
    } catch (err) {
      console.error("[Notifications] load failed:", err);
      setError(
        err?.response?.data?.message || "Failed to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 30s polling (matches the sidebar badge refresh cadence).
  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifs.filter((n) => n.unread).length;

  // ─── Mark all read ────────────────────────────────────────────────
  // Optimistic: flip every row to read immediately so the UI feels
  // instant. On failure, reload from server to restore truth.
  async function handleMarkAllRead() {
    const snapshot = notifs;
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
    try {
      await apiClient.post("/api/v1/notifications/seen-all");
      // Refresh sidebar badges → notifications badge drops to 0
      window.dispatchEvent(new CustomEvent("badges:refresh"));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.warn("[Notifications] mark-all failed, reverting:", err?.message);
      setNotifs(snapshot);
    }
  }

  // ─── Mark one read ────────────────────────────────────────────────
  // No-op if already read. Optimistic with rollback on failure.
  async function handleMarkRead(id) {
    const target = notifs.find((n) => n.id === id);
    if (!target || !target.unread) return;

    const snapshot = notifs;
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n))
    );
    try {
      await apiClient.post(
        `/api/v1/notifications/${encodeURIComponent(id)}/seen`
      );
      // Sidebar badge decrements via the refresh event
      window.dispatchEvent(new CustomEvent("badges:refresh"));
    } catch (err) {
      console.warn("[Notifications] mark-one failed, reverting:", err?.message);
      setNotifs(snapshot);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

      {/* Header: unread count + mark-all action */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontSize: "12px", color: "#4b5563" }}>
          {loading
            ? "Loading…"
            : `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
        </span>
        {unreadCount > 0 && !loading && (
          <button
            onClick={handleMarkAllRead}
            style={{
              fontSize: "12px",
              color: "#3b82f6",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            background: "#1a0606",
            border: "1px solid #ef444440",
            color: "#ef4444",
            fontSize: "12px",
          }}
        >
          {error}
        </div>
      )}

      {/* Success toast (auto-dismisses) */}
      {showSuccess && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 500,
            background: "#0a1a12",
            border: "1px solid #22c55e40",
            color: "#22c55e",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          All notifications marked as read.
        </div>
      )}

      {/* Empty state */}
      {!loading && notifs.length === 0 && (
        <div
          style={{
            padding: "40px 20px",
            textAlign: "center",
            fontSize: "12px",
            color: "#4b5563",
          }}
        >
          No notifications. You're all caught up.
        </div>
      )}

      {/* Notification rows */}
      {notifs.map((n) => {
        const cfg = TYPE_CONFIG[n.type] || DEFAULT_TYPE;
        const { Icon } = cfg;

        return (
          <div
            key={n.id}
            onClick={() => handleMarkRead(n.id)}
            style={{
              display: "flex",
              gap: "16px",
              padding: "16px",
              borderRadius: "12px",
              cursor: "pointer",
              // Aligned with Officer-Tabs palette
              background: n.unread ? "#0e0e18" : "#0a0a12",
              border: `1px solid ${n.unread ? "#1a1a2a" : "#13131e"}`,
              // Left accent bar telegraphs type at a glance
              borderLeft: `3px solid ${cfg.color}`,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#111120";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = n.unread
                ? "#0e0e18"
                : "#0a0a12";
            }}
          >
            {/* Type icon */}
            <span style={{ marginTop: "2px", flexShrink: 0 }}>
              <Icon size={16} color={cfg.color} />
            </span>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                {/* Title */}
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#fff",
                    opacity: n.unread ? 1 : 0.6,
                  }}
                >
                  {n.title}
                </div>

                {/* Right cluster: unread dot + timestamp */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexShrink: 0,
                  }}
                >
                  {n.unread && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#3b82f6",
                        display: "inline-block",
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#4b5563",
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    {n.time}
                  </span>
                </div>
              </div>

              {/* Body */}
              <p
                style={{
                  fontSize: "12px",
                  marginTop: "4px",
                  lineHeight: 1.6,
                  color: n.unread ? "#6b7280" : "#374151",
                }}
              >
                {n.body}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}