// apps/web/src/pages/Officer-Tabs/Account.jsx
import { useState, useEffect, useCallback } from "react";
import { KeyRound, UserCircle } from 'lucide-react';
import apiClient from "../../lib/api";

export default function Account() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/v1/auth/me');
      setProfile(data.data);
    } catch (err) {
      console.error('[Account] load failed:', err);
      setError(err?.response?.data?.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const initials = (() => {
    if (!profile?.fullName) return 'U';
    return profile.fullName
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0].toUpperCase())
      .join('');
  })();

  const fields = [
    { l: "BADGE / ID",             v: profile?.badgeId || "—" },
    { l: "ORGANIZATION",           v: profile?.agency || "—" },
    { l: "ASSIGNED JURISDICTION",  v: profile?.jurisdiction || "—" },
    { l: "ROLE",                   v: profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "—" },
    { l: "ACCOUNT STATUS",         v: profile?.status === 'active' ? 'Active' : (profile?.status || '—') },
    { l: "LAST UPDATED",           v: profile?.updatedAt ? new Date(profile.updatedAt).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—" },
  ];

  const card = { borderRadius: "12px", padding: "24px", marginBottom: "20px", background: "#0e0e18", border: "1px solid #1a1a2a" };
  const label = { fontSize: "9px", fontWeight: 500, marginBottom: "4px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" };
  const inputS = { width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" };

  const sanitizePw = (value) => value.replace(/\s/g, "").slice(0, 20);

  function validatePassword(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (pw.length > 20) return "Password must not exceed 20 characters.";
    if (!/[a-zA-Z]/.test(pw)) return "Password must include at least 1 letter.";
    if (!/[0-9]/.test(pw)) return "Password must include at least 1 number.";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) return "Password must include at least 1 special character (!@#$%^&*).";
    return null;
  }

  async function handleUpdatePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      setPwError("Please fill in all fields.");
      return;
    }
    const validation = validatePassword(newPw);
    if (validation) { setPwError(validation); return; }
    if (newPw !== confirmPw) { setPwError("New passwords do not match."); return; }

    setPwError(null);
    setSubmitting(true);
    try {
      await apiClient.post('/api/v1/account/change-password', {
        currentPassword: currentPw,
        newPassword: newPw,
        confirmPassword: confirmPw,
      });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
    } catch (err) {
      setPwError(
        err?.response?.data?.message || 'Could not update the password.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>Loading profile…</div>;
  }

  return (
    <div style={{ maxWidth: "640px" }}>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "12px" }}>
          {error}
        </div>
      )}

      {/* Suspension banner */}
      {profile?.status === 'suspended' && (
        <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", background: "#1a0f06", border: "1px solid #f59e0b40", color: "#f59e0b", fontSize: "13px", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: "4px" }}>⚠️ Account Suspended</div>
          Your account is suspended
          {profile?.suspendedUntil
            ? ` until ${new Date(profile.suspendedUntil).toLocaleString("en-PH", {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}`
            : ''}.
          {profile?.suspendReason ? ` Reason: ${profile.suspendReason}` : ''}
        </div>
      )}

      {/* Disabled banner */}
      {profile?.status === 'disabled' && (
        <div style={{ padding: "14px 16px", borderRadius: "10px", marginBottom: "16px", background: "#1a0606", border: "1px solid #ef444440", color: "#ef4444", fontSize: "13px", lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: "4px" }}>🚫 Account Disabled</div>
          Your account has been disabled. Contact your NBI supervisor to restore access.
          {profile?.suspendReason ? ` Reason: ${profile.suspendReason}` : ''}
        </div>
      )}

      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <UserCircle size={14} color="#4b5563" /> PROFILE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, flexShrink: 0, background: "#1e3a5f", color: "#60a5fa", border: "1.5px solid #3b82f640" }}>
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff" }}>{profile?.fullName || "—"}</div>
            <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{profile?.email || "—"}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 32px" }}>
          {fields.map((f) => (
            <div key={f.l}>
              <div style={label}>{f.l}</div>
              <div style={{ fontSize: "13px", color: "#fff" }}>{f.v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#080810", border: "1px solid #13131e", color: "#374151" }}>
          Jurisdiction is assigned by system administrators. Contact your NBI supervisor to request a change.
        </div>
      </div>

      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <KeyRound size={14} color="#4b5563" /> CHANGE PASSWORD
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={label}>CURRENT PASSWORD</div>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(sanitizePw(e.target.value))} autoComplete="new-password" style={inputS} />
          </div>
          <div>
            <div style={label}>NEW PASSWORD</div>
            <input type="password" value={newPw} onChange={(e) => setNewPw(sanitizePw(e.target.value))} autoComplete="new-password" style={inputS} />
            <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace" }}>
              8–20 characters · Letters + Numbers + Special (!@#$%^&*) · No spaces
            </div>
          </div>
          <div>
            <div style={label}>CONFIRM NEW PASSWORD</div>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(sanitizePw(e.target.value))} autoComplete="new-password" style={inputS} />
          </div>

          {pwError && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
              {pwError}
            </div>
          )}

          {showSuccess && (
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Password updated successfully.
            </div>
          )}

          <button onClick={handleUpdatePassword} disabled={submitting}
            style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: submitting ? "#2a2a3a" : "#3b82f6", color: "#fff", border: "none", cursor: submitting ? "not-allowed" : "pointer", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            {submitting && <span style={{ width: "12px", height: "12px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
            {submitting ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}