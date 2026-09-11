// apps/web/src/pages/Analyst-Tabs/Officers.jsx
import React, { useState, useCallback } from 'react';
import InviteOfficerModal from '../../components/InviteOfficerModal';

// Placeholder seed data — swap for a real fetch (e.g. GET /api/v1/admin/officers)
const seedOfficers = [
  { id: "OFF-1042", name: "Insp. R. Cruz", email: "r.cruz@nbi.gov.ph", region: "NCR", status: "Active" },
  { id: "OFF-1039", name: "Insp. M. Santos", email: "m.santos@nbi.gov.ph", region: "Region IV-A", status: "Active" },
  { id: "OFF-1031", name: "Insp. J. Reyes", email: "j.reyes@nbi.gov.ph", region: "NCR", status: "Pending" },
];

const card = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "20px" };
const thS  = { textAlign: "left", paddingBottom: "8px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", fontSize: "9px", letterSpacing: "0.06em" };
const tdS  = { padding: "8px 0", fontSize: "12px", borderTop: "1px solid #13131e" };

export default function Officers() {
  const [officers, setOfficers] = useState(seedOfficers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const handleInvited = useCallback((newOfficer) => {
    setOfficers(prev => [
      {
        id: newOfficer?.id ?? `OFF-${Math.floor(Math.random() * 9000) + 1000}`,
        name: newOfficer?.fullName ?? newOfficer?.name ?? "Invited Officer",
        email: newOfficer?.email ?? "—",
        region: newOfficer?.jurisdiction ?? newOfficer?.region ?? "—",
        status: "Pending",
      },
      ...prev,
    ]);
    setIsModalOpen(false);
    setToast("Invitation sent successfully.");
    setTimeout(() => setToast(null), 4000);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>Officers</div>
          <div style={{ fontSize: "11px", color: "#4b5563" }}>Manage officer access for your agency</div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#080810]"
        >
          <span className="text-base leading-none">+</span>
          Invite Officer
        </button>
      </div>

      {toast && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
          {toast}
        </div>
      )}

      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["OFFICER ID","NAME","EMAIL","REGION","STATUS"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {officers.map(o => (
              <tr key={o.id}>
                <td style={{ ...tdS, color: "#a855f7", fontFamily: "'JetBrains Mono',monospace" }}>{o.id}</td>
                <td style={{ ...tdS, fontWeight: 500, color: "#fff" }}>{o.name}</td>
                <td style={{ ...tdS, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{o.email}</td>
                <td style={{ ...tdS, color: "#9ca3af" }}>{o.region}</td>
                <td style={tdS}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px", color: o.status === "Pending" ? "#f59e0b" : "#22c55e" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: o.status === "Pending" ? "#f59e0b" : "#22c55e", display: "inline-block" }} />
                    {o.status}
                  </span>
                </td>
              </tr>
            ))}
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