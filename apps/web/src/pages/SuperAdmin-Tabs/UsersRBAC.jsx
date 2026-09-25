// apps/web/src/pages/SuperAdmin-Tabs/UsersRBAC.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const label = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };
const ROLE_COLOR = { Officer: "#3b82f6", Admin: "#f59e0b", Superadmin: A };
const REASSIGNABLE_ROLES = ["officer", "admin"];

const SUSPEND_DURATIONS = [
  { label: "1 day",   days: 1 },
  { label: "3 days",  days: 3 },
  { label: "7 days",  days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "Custom",  days: null },
];

const JURISDICTIONS = [
  "National / Regional", "NCR", "Region I", "Region II", "Region III",
  "Region IV-A", "Region IV-B", "Region V", "Region VI", "Region VII",
  "Region VIII", "Region IX", "Region X", "Region XI", "Region XII",
  "Region XIII", "BARMM", "CAR",
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function generateTempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits  = "23456789";
  const special = "!@#$%^&*";
  let pw = "";
  for (let i = 0; i < 8; i++) pw += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++) pw += digits[Math.floor(Math.random() * digits.length)];
  pw += special[Math.floor(Math.random() * special.length)];
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

export default function UsersRBAC() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [toast, setToast]               = useState(null);
  const [roleFilter, setRoleFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [detailUser, setDetailUser]     = useState(null);
  const [showProvision, setShowProvision] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(null);
  const [showSuspendModal, setShowSuspendModal] = useState(null);
  const [showDisableModal, setShowDisableModal] = useState(null);
  const [selectedRole, setSelectedRole] = useState("");
  const [suspendDays, setSuspendDays]   = useState(7);
  const [suspendCustom, setSuspendCustom] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [busyId, setBusyId]             = useState(null);
  const [actionBusy, setActionBusy]     = useState(false);
  const [provisionBusy, setProvisionBusy] = useState(false);

  const [pForm, setPForm] = useState({
    fullName: "", email: "", badgeId: "", agency: "",
    role: "officer", jurisdiction: "National / Regional", tempPassword: "",
  });

  function showToast(msg, kind = "success") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  }

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get("/api/v1/superadmin/users");
      setUsers(data.data.users ?? []);
    } catch (err) {
      console.error("[UsersRBAC] fetch failed:", err);
      setError(err?.response?.data?.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Reassign role
  function openRoleModal(user) {
    setSelectedRole(user.role || "officer");
    setShowRoleModal(user);
  }

  async function confirmRoleChange() {
    if (!showRoleModal || !selectedRole) return;
    setActionBusy(true);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${showRoleModal.id}/role`, { role: selectedRole });
      setUsers((prev) => prev.map((u) => (u.id === showRoleModal.id ? { ...u, role: selectedRole } : u)));
      if (detailUser?.id === showRoleModal.id) setDetailUser({ ...detailUser, role: selectedRole });
      showToast(`${showRoleModal.name} reassigned to ${selectedRole}.`);
      setShowRoleModal(null);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to reassign role.", "error");
    } finally {
      setActionBusy(false);
    }
  }

  // Suspend
  function openSuspendModal(user) {
    setSuspendDays(7);
    setSuspendCustom("");
    setSuspendReason("");
    setShowSuspendModal(user);
  }

  async function confirmSuspend() {
    if (!showSuspendModal) return;
    const chosen = SUSPEND_DURATIONS.find(d => d.days === suspendDays);
    const payload = { reason: suspendReason || undefined };

    if (chosen?.days) payload.days = chosen.days;
    else {
      if (!suspendCustom) { showToast("Please pick a custom date.", "error"); return; }
      payload.until = new Date(suspendCustom).toISOString();
    }

    setActionBusy(true);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${showSuspendModal.id}/suspend`, payload);
      await loadUsers();
      if (detailUser?.id === showSuspendModal.id) setDetailUser(null);
      showToast(`${showSuspendModal.name} suspended.`);
      setShowSuspendModal(null);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to suspend.", "error");
    } finally {
      setActionBusy(false);
    }
  }

  // Unsuspend
  async function unsuspend(user) {
    setBusyId(user.id);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${user.id}/unsuspend`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: "Active", raw_status: "active", suspendedUntil: null, suspendReason: null } : u)));
      if (detailUser?.id === user.id) setDetailUser({ ...detailUser, status: "Active", raw_status: "active" });
      showToast(`${user.name}'s suspension lifted.`);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to lift suspension.", "error");
    } finally {
      setBusyId(null);
    }
  }

  // Disable
  function openDisableModal(user) {
    setDisableReason("");
    setShowDisableModal(user);
  }

  async function confirmDisable() {
    if (!showDisableModal) return;
    setActionBusy(true);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${showDisableModal.id}/disable`, {
        reason: disableReason || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.id === showDisableModal.id ? { ...u, status: "Disabled", raw_status: "disabled", suspendReason: disableReason || null } : u)));
      if (detailUser?.id === showDisableModal.id) setDetailUser({ ...detailUser, status: "Disabled", raw_status: "disabled", suspendReason: disableReason || null });
      showToast(`${showDisableModal.name} disabled.`);
      setShowDisableModal(null);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to disable.", "error");
    } finally {
      setActionBusy(false);
    }
  }

  // Enable
  async function enableUser(user) {
    setBusyId(user.id);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${user.id}/enable`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: "Active", raw_status: "active" } : u)));
      if (detailUser?.id === user.id) setDetailUser({ ...detailUser, status: "Active", raw_status: "active" });
      showToast(`${user.name} enabled.`);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to enable.", "error");
    } finally {
      setBusyId(null);
    }
  }

  // Provision
  function openProvision() {
    setPForm({
      fullName: "", email: "", badgeId: "", agency: "",
      role: "officer", jurisdiction: "National / Regional",
      tempPassword: generateTempPassword(),
    });
    setShowProvision(true);
  }

  function copyTempPassword() {
    navigator.clipboard.writeText(pForm.tempPassword).then(() => showToast("Password copied to clipboard."));
  }

  async function confirmProvision() {
    const { fullName, email, badgeId, agency, role, jurisdiction, tempPassword } = pForm;
    if (!fullName.trim() || !email.trim() || !badgeId.trim() || !agency.trim()) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    if (tempPassword.length < 8) {
      showToast("Temporary password must be at least 8 characters.", "error");
      return;
    }
    setProvisionBusy(true);
    try {
      await apiClient.post("/api/v1/superadmin/users/provision", {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        badgeId: badgeId.trim(),
        agency: agency.trim(),
        role, jurisdiction, tempPassword,
      });
      await loadUsers();
      setShowProvision(false);
      showToast(`Account created for ${fullName}. Share the temp password securely.`);
    } catch (err) {
      showToast(err?.response?.data?.message || "Failed to provision account.", "error");
    } finally {
      setProvisionBusy(false);
    }
  }

  // Filter
  const filtered = users.filter((u) => {
    const mr = roleFilter === "all" || (u.role || "").toLowerCase() === roleFilter;
    const ms = statusFilter === "all" || (u.raw_status || "").toLowerCase() === statusFilter;
    const q = search.toLowerCase();
    const mq = !search ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.agency || "").toLowerCase().includes(q) ||
      (u.badge_id || "").toLowerCase().includes(q);
    return mr && ms && mq;
  });

  const inputS = { padding: "8px 12px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" };
  const statusColor = (s) => (s === "Active" ? "#22c55e" : s === "Disabled" ? "#6b7280" : "#ef4444");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {toast && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 999,
          padding: "12px 18px", borderRadius: "10px", fontSize: "13px", fontWeight: 500,
          background: toast.kind === "error" ? "#1a0606" : "#061a0f",
          border: `1px solid ${toast.kind === "error" ? "#ef444440" : "#22c55e40"}`,
          color: toast.kind === "error" ? "#ef4444" : "#22c55e",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)", maxWidth: "420px",
        }}>
          {toast.msg}
        </div>
      )}

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>{error}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
            <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, agency, badge…" style={{ ...inputS, paddingLeft: "30px", width: "220px" }} />
        </div>
        {["all","officer","admin"].map(f => (
          <button key={f} onClick={() => setRoleFilter(f)}
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: roleFilter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: roleFilter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
            {f === "all" ? "All Roles" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {["all","active","suspended","disabled"].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: statusFilter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: statusFilter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
            {f === "all" ? "All Status" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={openProvision}
          style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: A, border: "none", color: "#fff" }}>
          + Provision Account
        </button>
      </div>

      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["ID","NAME","ROLE","AGENCY","SCOPE","BADGE ID","LAST LOGIN","STATUS","ACTIONS"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (<tr><td colSpan={9} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading users…</td></tr>)}
            {!loading && filtered.length === 0 && (<tr><td colSpan={9} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No users match the current filters.</td></tr>)}
            {!loading && filtered.map(u => {
              const roleKey = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : "Officer";
              const rc = ROLE_COLOR[roleKey] || "#6b7280";
              const sc = statusColor(u.status);
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #13131e" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#111120"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>{u.id?.slice(-6) || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", fontWeight: 500, color: "#fff" }}>{u.name}</td>
                  <td style={{ padding: "11px 16px" }}><span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: rc + "20", color: rc }}>{roleKey}</span></td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", color: "#6b7280" }}>{u.agency || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", color: "#6b7280" }}>{u.scope || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{u.badge_id || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: sc }}>
                        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: sc, display: "inline-block" }} />
                        {u.status}
                      </span>
                      {u.status === "Suspended" && u.suspendedUntil && (
                        <span style={{ fontSize: "10px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>until {fmtDate(u.suspendedUntil)}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <button onClick={() => setDetailUser(u)} style={{ fontSize: "11px", fontWeight: 600, color: A, background: "none", border: "none", cursor: "pointer" }}>View</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {detailUser && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setDetailUser(null)}>
          <div style={{ width: "100%", maxWidth: "540px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, background: (ROLE_COLOR[detailUser.role?.charAt(0).toUpperCase() + detailUser.role?.slice(1)] || "#6b7280") + "20", color: ROLE_COLOR[detailUser.role?.charAt(0).toUpperCase() + detailUser.role?.slice(1)] || "#6b7280", border: `1px solid ${(ROLE_COLOR[detailUser.role?.charAt(0).toUpperCase() + detailUser.role?.slice(1)] || "#6b7280")}40` }}>
                  {(detailUser.name || "?").split(" ").slice(-1)[0][0]}{(detailUser.name || "?")[0]}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: "15px" }}>{detailUser.name}</div>
                  <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563" }}>{detailUser.email}</div>
                </div>
              </div>
              <button onClick={() => setDetailUser(null)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px", marginBottom: "20px" }}>
              {[
                { l: "ROLE",       v: detailUser.role },
                { l: "AGENCY",     v: detailUser.agency },
                { l: "BADGE / ID", v: detailUser.badge_id },
                { l: "SCOPE",      v: detailUser.scope },
                { l: "STATUS",     v: detailUser.status },
                { l: "LAST LOGIN", v: detailUser.last_login_at ? fmtDate(detailUser.last_login_at) : "—" },
                { l: "USER ID",    v: detailUser.id },
                ...(detailUser.status === "Suspended" && detailUser.suspendedUntil
                  ? [{ l: "SUSPENDED UNTIL", v: fmtDate(detailUser.suspendedUntil) }]
                  : []),
              ].map(f => (
                <div key={f.l}>
                  <div style={label}>{f.l}</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontFamily: f.l === "BADGE / ID" || f.l === "USER ID" ? "'JetBrains Mono',monospace" : "inherit" }}>{f.v}</div>
                </div>
              ))}
            </div>

            {detailUser.suspendReason && (
              <div style={{ padding: "12px 14px", borderRadius: "8px", marginBottom: "20px", background: "#1a0606", border: "1px solid #ef444430" }}>
                <div style={{ fontSize: "9px", color: "#ef4444", fontWeight: 700, letterSpacing: "0.06em", fontFamily: "'JetBrains Mono',monospace", marginBottom: "4px" }}>
                  {detailUser.status === "Disabled" ? "DISABLE REASON" : "SUSPENSION REASON"}
                </div>
                <div style={{ fontSize: "12px", color: "#f87171", lineHeight: 1.5 }}>{detailUser.suspendReason}</div>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <button onClick={() => openRoleModal(detailUser)} disabled={actionBusy || busyId === detailUser.id}
                style={{ flex: "1 1 30%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Reassign Role
              </button>

              {detailUser.status === "Suspended" ? (
                <button onClick={() => unsuspend(detailUser)} disabled={busyId === detailUser.id}
                  style={{ flex: "1 1 30%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#061a0f", border: "1px solid #22c55e40", color: "#22c55e", cursor: busyId === detailUser.id ? "wait" : "pointer", opacity: busyId === detailUser.id ? 0.5 : 1 }}>
                  Lift Suspension
                </button>
              ) : (
                <button onClick={() => openSuspendModal(detailUser)} disabled={actionBusy || busyId === detailUser.id || detailUser.status === "Disabled"}
                  style={{
                    flex: "1 1 30%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600,
                    background: "#2a1f0a",
                    border: "1px solid #f59e0b40",
                    color: "#f59e0b",
                    cursor: actionBusy || detailUser.status === "Disabled" ? "not-allowed" : "pointer",
                    opacity: detailUser.status === "Disabled" ? 0.4 : 1,
                  }}>
                  Suspend Account
                </button>
              )}

              {detailUser.status === "Disabled" ? (
                <button onClick={() => enableUser(detailUser)} disabled={busyId === detailUser.id}
                  style={{ flex: "1 1 30%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#061a0f", border: "1px solid #22c55e40", color: "#22c55e", cursor: busyId === detailUser.id ? "wait" : "pointer", opacity: busyId === detailUser.id ? 0.5 : 1 }}>
                  Enable Account
                </button>
              ) : (
                <button onClick={() => openDisableModal(detailUser)} disabled={actionBusy || busyId === detailUser.id}
                  style={{
                    flex: "1 1 30%", padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600,
                    background: "#3f1a1a",
                    border: "1px solid #ef444460",
                    color: "#ef4444",
                    cursor: actionBusy ? "not-allowed" : "pointer",
                  }}>
                  Disable Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {showSuspendModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !actionBusy && setShowSuspendModal(null)}>
          <div style={{ width: "100%", maxWidth: "460px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#f59e0b,transparent)" }} />

            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", margin: "0 auto 14px", display: "flex", alignItems: "center", justifyContent: "center", background: "#2a1f0a", border: "1px solid #f59e0b40" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                Suspend {showSuspendModal.name}?
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>
                They'll be temporarily blocked. The suspension <strong style={{ color: "#f59e0b" }}>lifts automatically</strong> when the period ends.
              </div>
            </div>

            <div style={label}>DURATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "16px" }}>
              {SUSPEND_DURATIONS.map(d => {
                const key = d.days ?? "custom";
                const selected = suspendDays === d.days;
                return (
                  <button key={key} onClick={() => setSuspendDays(d.days)}
                    style={{
                      padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                      background: selected ? "#2a1f0a" : "#080810",
                      border: `1.5px solid ${selected ? "#f59e0b60" : "#1a1a2a"}`,
                      color: selected ? "#f59e0b" : "#9ca3af",
                    }}>
                    {d.label}
                  </button>
                );
              })}
            </div>

            {suspendDays === null && (
              <div style={{ marginBottom: "16px" }}>
                <div style={label}>UNTIL DATE</div>
                <input type="datetime-local" value={suspendCustom} onChange={e => setSuspendCustom(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <div style={label}>REASON (OPTIONAL)</div>
              <textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} rows={2} placeholder="e.g. pending investigation"
                style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "12px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", resize: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowSuspendModal(null)} disabled={actionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmSuspend} disabled={actionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: actionBusy ? "#2a2a3a" : "#f59e0b", border: "none", color: "#0a0a12", cursor: actionBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {actionBusy && <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(0,0,0,0.3)", borderTopColor: "#0a0a12", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                {actionBusy ? "Suspending…" : "Confirm Suspension"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable confirmation modal */}
      {showDisableModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => !actionBusy && setShowDisableModal(null)}>
          <div style={{ width: "100%", maxWidth: "440px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#ef4444,transparent)" }} />

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#ef444415", border: "1px solid #ef444430", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
                Disable {showDisableModal.name}?
              </div>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>
                This will <strong style={{ color: "#ef4444" }}>permanently block</strong> their access.
                It won't lift automatically — you'll have to re-enable the account manually.
              </div>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <div style={label}>REASON (OPTIONAL)</div>
              <textarea value={disableReason} onChange={(e) => setDisableReason(e.target.value)} rows={2} placeholder="e.g. security incident, offboarded"
                style={{ width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", resize: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowDisableModal(null)} disabled={actionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmDisable} disabled={actionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: actionBusy ? "#2a2a3a" : "#ef4444", border: "none", color: "#fff", cursor: actionBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {actionBusy && <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                {actionBusy ? "Disabling…" : "Yes, Disable"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign role modal */}
      {showRoleModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !actionBusy && setShowRoleModal(null)}>
          <div style={{ width: "100%", maxWidth: "420px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Reassign Role</div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginBottom: "20px", lineHeight: 1.6 }}>
              Change role for <span style={{ color: "#fff", fontWeight: 600 }}>{showRoleModal.name}</span>. Takes effect on next sign-in.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {REASSIGNABLE_ROLES.map(r => {
                const rc = ROLE_COLOR[r.charAt(0).toUpperCase() + r.slice(1)] || "#6b7280";
                const selected = selectedRole === r;
                return (
                  <button key={r} onClick={() => setSelectedRole(r)}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "10px", cursor: "pointer", background: selected ? rc + "15" : "#080810", border: `1.5px solid ${selected ? rc + "60" : "#1a1a2a"}` }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: rc }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: selected ? rc : "#e2e8f0", textTransform: "capitalize", flex: 1, textAlign: "left" }}>{r}</span>
                    {selected && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3.5 3.5 5.5-6" stroke={rc} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowRoleModal(null)} disabled={actionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmRoleChange} disabled={actionBusy || selectedRole === showRoleModal.role}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: actionBusy || selectedRole === showRoleModal.role ? "#2a2a3a" : A, border: "none", color: "#fff", cursor: actionBusy || selectedRole === showRoleModal.role ? "not-allowed" : "pointer" }}>
                {actionBusy ? "Updating…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision modal */}
      {showProvision && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !provisionBusy && setShowProvision(false)}>
          <div style={{ width: "100%", maxWidth: "520px", maxHeight: "90vh", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />

            <div style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              Provision New Account
            </div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginBottom: "20px", lineHeight: 1.6 }}>
              Create a new officer or admin account. They'll log in with the temporary password below and should change it afterward.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={label}>FULL NAME</div>
                <input value={pForm.fullName} onChange={e => setPForm({ ...pForm, fullName: e.target.value })} placeholder="e.g. Insp. Juan Reyes"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={label}>EMAIL ADDRESS</div>
                <input type="email" value={pForm.email} onChange={e => setPForm({ ...pForm, email: e.target.value })} placeholder="e.g. j.reyes@nbi.gov.ph"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={label}>BADGE / EMP ID</div>
                <input value={pForm.badgeId} onChange={e => setPForm({ ...pForm, badgeId: e.target.value })} placeholder="e.g. NBI-CCRU-0071"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={label}>ROLE</div>
                <select value={pForm.role} onChange={e => setPForm({ ...pForm, role: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}>
                  <option value="officer">Officer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={label}>AGENCY</div>
                <input value={pForm.agency} onChange={e => setPForm({ ...pForm, agency: e.target.value })} placeholder="e.g. NBI Cybercrime Division"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={label}>JURISDICTION / SCOPE</div>
                <select value={pForm.jurisdiction} onChange={e => setPForm({ ...pForm, jurisdiction: e.target.value })}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}>
                  {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: "12px", marginBottom: "20px" }}>
              <div style={label}>TEMPORARY PASSWORD</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <input value={pForm.tempPassword} onChange={e => setPForm({ ...pForm, tempPassword: e.target.value })}
                  style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", fontFamily: "'JetBrains Mono',monospace", boxSizing: "border-box" }} />
                <button onClick={copyTempPassword}
                  style={{ padding: "10px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer", whiteSpace: "nowrap" }}>
                  Copy
                </button>
                <button onClick={() => setPForm({ ...pForm, tempPassword: generateTempPassword() })}
                  style={{ padding: "10px 14px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer", whiteSpace: "nowrap" }}>
                  New
                </button>
              </div>
              <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                Share this securely. The user should change it after first login.
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setShowProvision(false)} disabled={provisionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: provisionBusy ? "not-allowed" : "pointer" }}>
                Cancel
              </button>
              <button onClick={confirmProvision} disabled={provisionBusy}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: provisionBusy ? "#2a2a3a" : A, border: "none", color: "#fff", cursor: provisionBusy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {provisionBusy && <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                {provisionBusy ? "Creating…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}