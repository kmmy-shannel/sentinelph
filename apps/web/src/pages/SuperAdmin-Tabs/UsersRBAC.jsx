// apps/web/src/pages/SuperAdmin-Tabs/UsersRBAC.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const label = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };
const ROLE_COLOR = { Officer: "#3b82f6", Admin: "#f59e0b", Superadmin: A };
const REASSIGNABLE_ROLES = ["officer", "admin"];

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
  const [selectedRole, setSelectedRole] = useState("");
  const [busyId, setBusyId]             = useState(null);
  const [actionBusy, setActionBusy]     = useState(false);

  function showToast(msg, kind = "success") {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Fetch users ────────────────────────────────────────────
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

  // ── Toggle suspend / restore ───────────────────────────────
  async function toggleStatus(user) {
    const action = user.status === "Active" ? "suspend" : "restore";
    setBusyId(user.id);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${user.id}/${action}`);
      const newStatus = action === "suspend" ? "Suspended" : "Active";
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u))
      );
      if (detailUser?.id === user.id) {
        setDetailUser({ ...detailUser, status: newStatus });
      }
      showToast(
        action === "suspend"
          ? `${user.name} suspended — no longer able to sign in`
          : `${user.name} restored`
      );
    } catch (err) {
      console.error(`[UsersRBAC] ${action} failed:`, err);
      showToast(
        err?.response?.data?.message || `Failed to ${action} account.`,
        "error"
      );
    } finally {
      setBusyId(null);
    }
  }

  // ── Reassign role ──────────────────────────────────────────
  function openRoleModal(user) {
    setSelectedRole(user.role || "officer");
    setShowRoleModal(user);
  }

  async function confirmRoleChange() {
    if (!showRoleModal || !selectedRole) return;
    setActionBusy(true);
    try {
      await apiClient.post(`/api/v1/superadmin/users/${showRoleModal.id}/role`, {
        role: selectedRole,
      });
      const updated = { ...showRoleModal, role: selectedRole };
      setUsers((prev) =>
        prev.map((u) => (u.id === showRoleModal.id ? { ...u, role: selectedRole } : u))
      );
      if (detailUser?.id === showRoleModal.id) {
        setDetailUser(updated);
      }
      showToast(
        `${showRoleModal.name} reassigned to ${selectedRole}. They'll see the new role on next sign-in.`
      );
      setShowRoleModal(null);
    } catch (err) {
      console.error("[UsersRBAC] role change failed:", err);
      showToast(
        err?.response?.data?.message || "Failed to reassign role.",
        "error"
      );
    } finally {
      setActionBusy(false);
    }
  }

  // ── Rotate KMS key ─────────────────────────────────────────
  async function rotateKms(user) {
    if (!confirm(`Rotate the KMS key for ${user.name}? Their old key will be invalidated.`)) return;
    setActionBusy(true);
    try {
      const { data } = await apiClient.post(
        `/api/v1/superadmin/users/${user.id}/kms/rotate`
      );
      const newKey = data?.data?.kms_key_id || "—";
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, kms_key_id: newKey } : u))
      );
      if (detailUser?.id === user.id) {
        setDetailUser({ ...detailUser, kms_key_id: newKey });
      }
      showToast(`KMS key rotated — new ID ${newKey.slice(0, 20)}…`);
    } catch (err) {
      console.error("[UsersRBAC] rotate failed:", err);
      showToast(
        err?.response?.data?.message || "Failed to rotate KMS key.",
        "error"
      );
    } finally {
      setActionBusy(false);
    }
  }

  // ── Client-side filtering ──────────────────────────────────
  const filtered = users.filter((u) => {
    const mr = roleFilter === "all" || (u.role || "").toLowerCase() === roleFilter;
    const ms = statusFilter === "all" || (u.status || "").toLowerCase() === statusFilter;
    const q = search.toLowerCase();
    const mq =
      !search ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.agency || "").toLowerCase().includes(q) ||
      (u.badge_id || "").toLowerCase().includes(q);
    return mr && ms && mq;
  });

  const inputS = { padding: "8px 12px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 999,
            padding: "12px 18px",
            borderRadius: "10px",
            fontSize: "13px",
            fontWeight: 500,
            background: toast.kind === "error" ? "#1a0606" : "#061a0f",
            border: `1px solid ${toast.kind === "error" ? "#ef444440" : "#22c55e40"}`,
            color: toast.kind === "error" ? "#ef4444" : "#22c55e",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            animation: "fadeIn 0.2s ease",
            maxWidth: "420px",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="#4b5563" strokeWidth="1.2" />
            <path d="M9.5 9.5l2.5 2.5" stroke="#4b5563" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, agency, badge…"
            style={{ ...inputS, paddingLeft: "30px", width: "220px" }} />
        </div>
        {["all","officer","admin"].map(f => (
          <button key={f} onClick={() => setRoleFilter(f)}
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: roleFilter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: roleFilter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
            {f === "all" ? "All Roles" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        {["all","active","suspended"].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            style={{ padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 500, cursor: "pointer", background: statusFilter === f ? "#1a1a2a" : "transparent", border: "1px solid #1a1a2a", color: statusFilter === f ? "#e2e8f0" : "#4b5563", textTransform: "capitalize" }}>
            {f === "all" ? "All Status" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button onClick={() => setShowProvision(true)}
          style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", background: A, border: "none", color: "#fff" }}>
          + Provision Account
        </button>
      </div>

      {/* Table */}
      <div style={{ borderRadius: "12px", overflow: "hidden", background: "#0e0e18", border: "1px solid #1a1a2a" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a2a" }}>
              {["ID","NAME","ROLE","AGENCY","SCOPE","BADGE ID","LAST LOGIN","STATUS","KMS KEY","ACTIONS"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>Loading users…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding: "20px", textAlign: "center", color: "#4b5563", fontSize: "12px" }}>No users match the current filters.</td></tr>
            )}
            {!loading && filtered.map(u => {
              const roleKey = u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1) : "Officer";
              const rc = ROLE_COLOR[roleKey] || "#6b7280";
              const isActive = u.status === "Active";
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #13131e" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#111120"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>{u.id?.slice(-6) || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", fontWeight: 500, color: "#fff" }}>{u.name}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, background: rc + "20", color: rc }}>{roleKey}</span>
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", color: "#6b7280" }}>{u.agency || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "12px", color: "#6b7280" }}>{u.scope || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{u.badge_id || "—"}</td>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: isActive ? "#22c55e" : "#ef4444" }}>
                      <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: isActive ? "#22c55e" : "#ef4444", display: "inline-block" }} />
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px", fontSize: "11px", color: A, fontFamily: "'JetBrains Mono',monospace" }}>{u.kms_key_id || "—"}</td>
                  <td style={{ padding: "11px 16px" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setDetailUser(u)} style={{ fontSize: "11px", fontWeight: 600, color: A, background: "none", border: "none", cursor: "pointer" }}>View</button>
                      <button
                        onClick={() => toggleStatus(u)}
                        disabled={busyId === u.id}
                        style={{ fontSize: "11px", fontWeight: 600, color: isActive ? "#ef4444" : "#22c55e", background: "none", border: "none", cursor: busyId === u.id ? "wait" : "pointer", opacity: busyId === u.id ? 0.5 : 1 }}>
                        {busyId === u.id ? "…" : isActive ? "Suspend" : "Restore"}
                      </button>
                    </div>
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
          <div style={{ width: "100%", maxWidth: "520px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />

            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, background: (ROLE_COLOR[detailUser.role ? detailUser.role.charAt(0).toUpperCase() + detailUser.role.slice(1) : "Officer"] || "#6b7280") + "20", color: ROLE_COLOR[detailUser.role ? detailUser.role.charAt(0).toUpperCase() + detailUser.role.slice(1) : "Officer"] || "#6b7280", border: `1px solid ${(ROLE_COLOR[detailUser.role ? detailUser.role.charAt(0).toUpperCase() + detailUser.role.slice(1) : "Officer"] || "#6b7280")}40`, flexShrink: 0 }}>
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
                { l: "LAST LOGIN", v: detailUser.last_login_at ? new Date(detailUser.last_login_at).toLocaleString("en-PH") : "—" },
                { l: "KMS KEY",    v: detailUser.kms_key_id || "—" },
                { l: "USER ID",    v: detailUser.id },
              ].map(f => (
                <div key={f.l}>
                  <div style={label}>{f.l}</div>
                  <div style={{ fontSize: "13px", color: "#fff", fontFamily: f.l === "KMS KEY" || f.l === "BADGE / ID" || f.l === "USER ID" ? "'JetBrains Mono',monospace" : "inherit" }}>{f.v}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => openRoleModal(detailUser)}
                disabled={actionBusy}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Reassign Role
              </button>
              <button
                onClick={() => rotateKms(detailUser)}
                disabled={actionBusy}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: `1px solid ${A}40`, color: A, cursor: actionBusy ? "not-allowed" : "pointer" }}>
                Rotate KMS Key
              </button>
              <button
                onClick={() => toggleStatus(detailUser)}
                disabled={busyId === detailUser.id}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: detailUser.status === "Active" ? "#3f1a1a" : "#061a0f", border: `1px solid ${detailUser.status === "Active" ? "#ef444440" : "#22c55e40"}`, color: detailUser.status === "Active" ? "#ef4444" : "#22c55e", cursor: busyId === detailUser.id ? "wait" : "pointer", opacity: busyId === detailUser.id ? 0.5 : 1 }}>
                {detailUser.status === "Active" ? "Suspend Account" : "Restore Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Role modal */}
      {showRoleModal && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !actionBusy && setShowRoleModal(null)}>
          <div style={{ width: "100%", maxWidth: "420px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />

            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>
              Reassign Role
            </div>
            <div style={{ fontSize: "12px", color: "#4b5563", marginBottom: "20px", lineHeight: 1.6 }}>
              Change the role for <span style={{ color: "#fff", fontWeight: 600 }}>{showRoleModal.name}</span>. The new role takes effect the next time they sign in.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
              {REASSIGNABLE_ROLES.map(r => {
                const rc = ROLE_COLOR[r.charAt(0).toUpperCase() + r.slice(1)] || "#6b7280";
                const selected = selectedRole === r;
                return (
                  <button key={r}
                    onClick={() => setSelectedRole(r)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      background: selected ? rc + "15" : "#080810",
                      border: `1.5px solid ${selected ? rc + "60" : "#1a1a2a"}`,
                      transition: "all 0.15s",
                    }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: rc, flexShrink: 0 }} />
                    <span style={{ fontSize: "13px", fontWeight: 600, color: selected ? rc : "#e2e8f0", textTransform: "capitalize", flex: 1, textAlign: "left" }}>{r}</span>
                    {selected && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7l3.5 3.5 5.5-6" stroke={rc} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
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
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: actionBusy || selectedRole === showRoleModal.role ? "#2a2a3a" : A, border: "none", color: "#fff", cursor: actionBusy || selectedRole === showRoleModal.role ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                {actionBusy && <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                {actionBusy ? "Updating…" : "Confirm Change"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision modal (placeholder) */}
      {showProvision && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowProvision(false)}>
          <div style={{ width: "100%", maxWidth: "480px", margin: "0 16px", borderRadius: "20px", padding: "28px", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)", position: "relative" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${A},transparent)` }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>Provision New Account</div>
              <button onClick={() => setShowProvision(false)} style={{ color: "#4b5563", background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                { l: "FULL NAME",      ph: "e.g. Insp. J. Reyes" },
                { l: "EMAIL ADDRESS",  ph: "e.g. j.reyes@nbi.gov.ph" },
                { l: "BADGE / EMP ID", ph: "e.g. NBI-CCRU-0071" },
                { l: "AGENCY",         ph: "e.g. NBI Cybercrime Division" },
              ].map(f => (
                <div key={f.l}>
                  <div style={label}>{f.l}</div>
                  <input placeholder={f.ph} style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <div style={label}>ROLE</div>
                <select style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" }}>
                  <option>Officer</option>
                  <option>Admin</option>
                </select>
              </div>
              <div>
                <div style={label}>JURISDICTION / SCOPE</div>
                <select style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" }}>
                  <option>NCR</option><option>National</option><option>Region III</option><option>Region IV-A</option><option>Region VII</option>
                </select>
              </div>
              <button onClick={() => { setShowProvision(false); showToast("Provision is not wired to the backend yet."); }}
                style={{ width: "100%", padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, background: A, color: "#fff", border: "none", cursor: "pointer", marginTop: "4px" }}>
                Provision Account & Generate KMS Key
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}