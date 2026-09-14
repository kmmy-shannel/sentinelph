// apps/web/src/pages/SuperAdmin-Tabs/UsersRBAC.jsx
import React, { useState, useEffect, useCallback } from "react";
import apiClient from "../../lib/api";

const A = "#22c55e";
const label = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };
const ROLE_COLOR = { Officer: "#3b82f6", Analyst: "#a855f7", Auditor: "#22c55e", Superadmin: A, Admin: "#f59e0b" };

export default function UsersRBAC() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [roleFilter, setRoleFilter]     = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch]             = useState("");
  const [detailUser, setDetailUser]     = useState(null);
  const [showProvision, setShowProvision] = useState(false);
  const [busyId, setBusyId]             = useState(null);

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
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, status: action === "suspend" ? "Suspended" : "Active" }
            : u
        )
      );
      if (detailUser?.id === user.id) {
        setDetailUser({
          ...detailUser,
          status: action === "suspend" ? "Suspended" : "Active",
        });
      }
    } catch (err) {
      console.error(`[UsersRBAC] ${action} failed:`, err);
      setError(err?.response?.data?.message || `Failed to ${action} account.`);
    } finally {
      setBusyId(null);
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
        {["all","officer","analyst","auditor"].map(f => (
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
              <button style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>Reassign Role</button>
              <button style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#111120", border: `1px solid ${A}40`, color: A, cursor: "pointer" }}>Rotate KMS Key</button>
              <button
                onClick={() => toggleStatus(detailUser)}
                disabled={busyId === detailUser.id}
                style={{ flex: 1, padding: "10px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#3f1a1a", border: "1px solid #ef444440", color: "#ef4444", cursor: busyId === detailUser.id ? "wait" : "pointer", opacity: busyId === detailUser.id ? 0.5 : 1 }}>
                {detailUser.status === "Active" ? "Suspend Account" : "Restore Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision modal (unchanged, non-functional placeholder) */}
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
                  <option>Analyst</option>
                  <option>Auditor</option>
                </select>
              </div>
              <div>
                <div style={label}>JURISDICTION / SCOPE</div>
                <select style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none" }}>
                  <option>NCR</option><option>National</option><option>Region III</option><option>Region IV-A</option><option>Region VII</option>
                </select>
              </div>
              <button onClick={() => setShowProvision(false)}
                style={{ width: "100%", padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, background: A, color: "#fff", border: "none", cursor: "pointer", marginTop: "4px" }}>
                Provision Account & Generate KMS Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}