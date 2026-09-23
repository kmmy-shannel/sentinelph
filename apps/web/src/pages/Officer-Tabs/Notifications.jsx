// apps/web/src/pages/Officer-Tabs/Notifications.jsx
import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import apiClient from "../../lib/api";

const TYPE_ICON = {
  urgent: <AlertTriangle size={16} color="#f59e0b" />,
  info:   <Info size={16} color="#3b82f6" />,
  system: <ShieldCheck size={16} color="#6b7280" />,
};

export default function Notifications() {
  const [notifs, setNotifs]             = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [showSuccess, setShowSuccess]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/v1/notifications');
      setNotifs(data?.data ?? []);
    } catch (err) {
      console.error('[Notifications] load failed:', err);
      setError(err?.response?.data?.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const unreadCount = notifs.filter(n => n.unread).length;

  async function handleMarkAllRead() {
    // Optimistic: hide all unread dots immediately
    setNotifs(prev => prev.map(n => ({ ...n, unread: false })));
    try {
      await apiClient.post('/api/v1/notifications/seen-all');
      // Refresh badges in the sidebar → notifications badge goes to 0
      window.dispatchEvent(new CustomEvent('badges:refresh'));
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch {
      load();
    }
  }

  async function handleMarkRead(id) {
    const wasUnread = notifs.find(n => n.id === id)?.unread;
    if (!wasUnread) return;

    // Optimistic: hide this one dot immediately
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, unread: false } : n));
    try {
      await apiClient.post(`/api/v1/notifications/${encodeURIComponent(id)}/seen`);
      // Refresh sidebar so the badge decrements
      window.dispatchEvent(new CustomEvent('badges:refresh'));
    } catch {
      load();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: "#4b5563" }}>
          {loading ? "Loading…" : `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
        </span>
        {unreadCount > 0 && !loading && (
          <button onClick={handleMarkAllRead}
            style={{ fontSize: "12px", color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
            Mark all as read
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {showSuccess && (
        <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          All notifications marked as read.
        </div>
      )}

      {!loading && notifs.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "12px", color: "#4b5563" }}>
          No notifications. You're all caught up.
        </div>
      )}

      {notifs.map((n) => (
        <div key={n.id}
          onClick={() => handleMarkRead(n.id)}
          style={{ display: "flex", gap: "16px", padding: "16px", borderRadius: "12px", cursor: "pointer", background: n.unread ? "#0f0f1c" : "#0a0a12", border: `1px solid ${n.unread ? "#1e1e30" : "#13131e"}`, transition: "background 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#111120"}
          onMouseLeave={(e) => e.currentTarget.style.background = n.unread ? "#0f0f1c" : "#0a0a12"}>
          <span style={{ marginTop: "2px", flexShrink: 0 }}>{TYPE_ICON[n.type] || TYPE_ICON.info}</span>
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