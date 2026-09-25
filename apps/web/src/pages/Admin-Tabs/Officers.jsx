// apps/web/src/pages/Admin-Tabs/Officers.jsx
import React, { useCallback, useEffect, useState } from 'react';
import InviteOfficerModal from '../../components/InviteOfficerModal';
import apiClient from '../../lib/api';

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function Officers() {
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const loadOfficers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/api/v1/admin/officers');
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.officers || response.data?.data || [];
      setOfficers(list);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to load officers.'
      );
      setOfficers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfficers();
  }, [loadOfficers]);

  const handleInvited = useCallback((newOfficer) => {
    setOfficers((prev) => [
      {
        _id: newOfficer?.id ?? `pending-${Date.now()}`,
        fullName: newOfficer?.fullName ?? newOfficer?.name ?? 'Invited Officer',
        email: newOfficer?.email ?? '—',
        badgeId: newOfficer?.badgeId ?? '—',
        agency: newOfficer?.agency ?? '—',
        jurisdiction: newOfficer?.jurisdiction ?? newOfficer?.region ?? '—',
        status: newOfficer?.status ?? 'pending_activation',
      },
      ...prev,
    ]);
    setIsModalOpen(false);
    setToast(`Invitation sent to ${newOfficer?.email ?? 'officer'}.`);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const statusLabel = (status) => {
    if (status === 'active') return 'Active';
    if (status === 'pending_activation') return 'Pending';
    if (status === 'suspended') return 'Suspended';
    return status || 'Unknown';
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Officers</div>
          <div style={{ fontSize: "11px", color: "#4b5563" }}>Manage officer access across all regions</div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#080810]"
        >
          <span className="text-base leading-none">+</span>
          Add Officer
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["NAME", "EMAIL", "BADGE ID", "AGENCY", "REGION", "STATUS"].map((h) => (
                <th key={h} style={thS}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...tdS, textAlign: "center", color: "#4b5563", padding: "24px 0" }}>Loading officers…</td></tr>
            ) : officers.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tdS, textAlign: "center", color: "#4b5563", padding: "24px 0" }}>No officers yet. Click "Invite Officer" to add one.</td></tr>
            ) : (
              officers.map((o) => (
                <tr key={o._id || o.email}>
                  <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{o.fullName || o.name || '—'}</td>
                  <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{o.email || '—'}</td>
                  <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{o.badgeId || '—'}</td>
                  <td style={{ ...tdS, color: "#9ca3af" }}>{o.agency || '—'}</td>
                  <td style={{ ...tdS, color: "#a855f7", fontWeight: 500 }}>{o.jurisdiction || '—'}</td>
                  <td style={tdS}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: o.status === "active" ? "#22c55e" : "#f59e0b" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: o.status === "active" ? "#22c55e" : "#f59e0b", display: "inline-block" }} />
                      {statusLabel(o.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <InviteOfficerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onInvited={handleInvited}
      />
    </div>
  );
}