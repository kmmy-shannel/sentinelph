// apps/web/src/pages/Officer-Tabs/Notifications.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, AlertTriangle, Info } from "lucide-react";
import apiClient from "../../lib/api";

const TYPE_CONFIG = {
  urgent: { Icon: AlertTriangle, color: "#f59e0b", label: "Action Required" },
  info:   { Icon: Info,          color: "#3b82f6", label: "Update" },
  system: { Icon: ShieldCheck,   color: "#6b7280", label: "System" },
};

const DEFAULT_TYPE = TYPE_CONFIG.info;

function extractReportId(notifId, type) {
  if (!notifId || type !== "urgent") return null;
  const m = notifId.match(/^(oa|ta)-(.+)$/);
  return m ? m[2] : null;
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for the confirmation modal
  const [showConfirmAll, setShowConfirmAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get("/api/v1/notifications");
      setNotifs(data?.data ?? []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifs.filter((n) => n.unread).length;

  async function handleMarkAllRead() {
    const snapshot = notifs;
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
    setShowConfirmAll(false);
    try {
      await apiClient.post("/api/v1/notifications/seen-all");
      window.dispatchEvent(new CustomEvent("badges:refresh"));
    } catch (err) {
      setNotifs(snapshot);
    }
  }

  async function handleMarkRead(id) {
    const target = notifs.find((n) => n.id === id);
    if (!target || !target.unread) return;

    const snapshot = notifs;
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    try {
      await apiClient.post(`/api/v1/notifications/${encodeURIComponent(id)}/seen`);
      window.dispatchEvent(new CustomEvent("badges:refresh"));
    } catch (err) {
      setNotifs(snapshot);
    }
  }

  async function handleReviewClick(e, notif) {
    e.stopPropagation();
    const reportId = extractReportId(notif.id, notif.type);
    if (!reportId) return;

    await handleMarkRead(notif.id);
    navigate(`/officer/queue?open=${encodeURIComponent(reportId)}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#4b5563" }}>
          {loading ? "Loading…" : `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
        </span>
        {unreadCount > 0 && !loading && (
          <button
            onClick={() => setShowConfirmAll(true)}
            style={{ fontSize: "12px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {error && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>{error}</div>}

      {!loading && notifs.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
          No notifications. You're all caught up.
        </div>
      )}

      {/* Notification Rows (History is kept forever) */}
      {notifs.map((n) => {
        const cfg = TYPE_CONFIG[n.type] || DEFAULT_TYPE;
        const { Icon } = cfg;
        const showReview = n.type === "urgent" && n.unread; // Only show review if unread

        return (
          <div
            key={n.id}
            onClick={() => handleMarkRead(n.id)}
            style={{
              display: "flex",
              gap: "16px",
              padding: "16px",
              borderRadius: "12px",
              cursor: n.unread ? "pointer" : "default",
              // HIGHLIGHT LOGIC: Unread is dark/bright, Read is faded/muted
              background: n.unread ? "#0e0e18" : "#080810",
              border: `1px solid ${n.unread ? "#2a2a3a" : "#13131e"}`,
              borderLeft: `3px solid ${n.unread ? cfg.color : "#1a1a2a"}`,
              opacity: n.unread ? 1 : 0.6,
              transition: "all 0.2s",
            }}
          >
            <span style={{ marginTop: "2px", flexShrink: 0 }}>
              <Icon size={16} color={n.unread ? cfg.color : "#4b5563"} />
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ fontWeight: 600, fontSize: "13px", color: "#fff" }}>
                  {n.title}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {n.unread && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />}
                  <span style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{n.time}</span>
                </div>
              </div>

              <p style={{ fontSize: "12px", marginTop: "4px", lineHeight: 1.6, color: n.unread ? "#cbd5e1" : "#6b7280" }}>
                {n.body}
              </p>

              {showReview && (
                <div style={{ marginTop: "10px" }}>
                  <button
                    onClick={(e) => handleReviewClick(e, n)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px",
                      borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                      background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b",
                    }}
                  >
                    Review
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* CONFIRMATION MODAL FOR "MARK ALL AS READ" */}
      {showConfirmAll && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 250, background: "rgba(6,6,15,0.75)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "100%", maxWidth: "380px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>Mark all as read?</div>
            <div style={{ fontSize: "13px", color: "#9ca3af", lineHeight: 1.6, marginBottom: "24px" }}>
              This will remove the highlight from all unread notifications. They will still be in your history.
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowConfirmAll(false)} style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleMarkAllRead} style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#3b82f6", border: "none", color: "#fff", cursor: "pointer" }}>
                Yes, Mark All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}