// apps/web/src/pages/Officer-Tabs/Account.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  KeyRound,
  UserCircle,
  Eye,
  EyeOff,
  Check,
  X,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import apiClient, { changePassword } from "../../lib/api";

// ─── Eye-toggle password input ────────────────────────────────────────
// A single component reused for all three fields. Owns its own
// visible/hidden state so toggling one field never reveals the others.
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  inputStyle,
  hasError = false,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        style={{
          ...inputStyle,
          paddingRight: "42px",
          borderColor: hasError ? "#ef4444" : inputStyle.border,
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: "10px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          padding: "4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4b5563",
        }}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ─── Password strength scoring ────────────────────────────────────────
// Returns { score: 0-5, label, color } where score is the number of
// satisfied criteria. The meter shows this many bars filled.
function scorePassword(pw) {
  if (!pw) return { score: 0, label: "", color: "#374151" };

  let score = 0;

  // Length tiers
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;

  // Character class diversity
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw);

  if (hasLower && hasUpper) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial) score += 1;

  // Cap at 5
  if (score > 5) score = 5;

  // Map score → label + color
  if (score <= 1) return { score, label: "Very Weak", color: "#ef4444" };
  if (score === 2) return { score, label: "Weak", color: "#f97316" };
  if (score === 3) return { score, label: "Fair", color: "#f59e0b" };
  if (score === 4) return { score, label: "Strong", color: "#22c55e" };
  return { score: 5, label: "Very Strong", color: "#16a34a" };
}

// ─── Strength meter component ─────────────────────────────────────────
function PasswordStrengthMeter({ value }) {
  const { score, label, color } = useMemo(() => scorePassword(value), [value]);

  if (!value) return null;

  return (
    <div style={{ marginTop: "8px" }}>
      {/* 5-segment bar */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          height: "4px",
          marginBottom: "6px",
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              borderRadius: "2px",
              background: i < score ? color : "#1a1a2a",
              transition: "background 120ms ease",
            }}
          />
        ))}
      </div>

      {/* Label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "10px",
          fontFamily: "'JetBrains Mono',monospace",
          color,
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: "0.04em" }}>
          {label.toUpperCase()}
        </span>
        <span style={{ color: "#4b5563" }}>
          {/* Per-criterion hints */}
          {[
            { ok: value.length >= 8, label: "8+" },
            { ok: /[a-z]/.test(value), label: "a-z" },
            { ok: /[A-Z]/.test(value), label: "A-Z" },
            { ok: /[0-9]/.test(value), label: "0-9" },
            {
              ok: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value),
              label: "!@#",
            },
          ].map((c) => (
            <span
              key={c.label}
              style={{
                marginLeft: "6px",
                color: c.ok ? "#22c55e" : "#374151",
                fontWeight: c.ok ? 700 : 500,
              }}
            >
              {c.label}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

export default function Account() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Top-level error (server response, network failure, wrong current pw)
  const [pwError, setPwError] = useState(null);
  // Field-level errors shown inline under each input
  const [fieldErrors, setFieldErrors] = useState({
    newPw: null,
    confirmPw: null,
  });

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
      .split(/[\s@._+^-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0].toUpperCase())
      .join('');
  })();

  const fields = [
    { l: "BADGE / ID",            v: profile?.badgeId || "—" },
    { l: "ORGANIZATION",          v: profile?.agency || "—" },
    { l: "ASSIGNED JURISDICTION", v: profile?.jurisdiction || "—" },
    {
      l: "ROLE",
      v: profile?.role
        ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
        : "—",
    },
    {
      l: "ACCOUNT STATUS",
      v: profile?.status === 'active' ? 'Active' : (profile?.status || '—'),
    },
    {
      l: "LAST UPDATED",
      v: profile?.updatedAt
        ? new Date(profile.updatedAt).toLocaleString("en-PH", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
    },
  ];

  const card = {
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "20px",
    background: "#0e0e18",
    border: "1px solid #1a1a2a",
  };
  const label = {
    fontSize: "9px",
    fontWeight: 500,
    marginBottom: "4px",
    color: "#4b5563",
    fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: "0.06em",
  };
  const inputS = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "10px",
    fontSize: "13px",
    background: "#080810",
    border: "1px solid #1a1a2a",
    color: "#e2e8f0",
    outline: "none",
    boxSizing: "border-box",
  };

  const sanitizePw = (value) => value.replace(/\s/g, "").slice(0, 20);

  function validatePassword(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (pw.length > 20) return "Password must not exceed 20 characters.";
    if (!/[a-zA-Z]/.test(pw)) return "Password must include at least 1 letter.";
    if (!/[0-9]/.test(pw)) return "Password must include at least 1 number.";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw))
      return "Password must include at least 1 special character (!@#$%^&*).";
    return null;
  }

  // ── Field handlers — validate on every keystroke ──────────────────
  function handleNewPwChange(value) {
    const sanitized = sanitizePw(value);
    setNewPw(sanitized);
    // Clear the top-level error as soon as the user starts fixing things.
    if (pwError) setPwError(null);

    // Live-validate the new password
    const err = sanitized.length === 0 ? null : validatePassword(sanitized);
    setFieldErrors((prev) => ({
      ...prev,
      newPw: err,
      // Also re-check the confirm field if it's already filled
      confirmPw:
        confirmPw.length > 0 && sanitized !== confirmPw
          ? "Passwords do not match."
          : null,
    }));
  }

  function handleConfirmPwChange(value) {
    const sanitized = sanitizePw(value);
    setConfirmPw(sanitized);
    if (pwError) setPwError(null);

    setFieldErrors((prev) => ({
      ...prev,
      confirmPw:
        sanitized.length > 0 && newPw !== sanitized
          ? "Passwords do not match."
          : null,
    }));
  }

  async function handleUpdatePassword() {
    // Client-side validation before hitting the server
    if (!currentPw || !newPw || !confirmPw) {
      setPwError("Please fill in all fields.");
      return;
    }
    const validation = validatePassword(newPw);
    if (validation) {
      setFieldErrors((prev) => ({ ...prev, newPw: validation }));
      setPwError(validation);
      return;
    }
    if (newPw !== confirmPw) {
      setFieldErrors((prev) => ({
        ...prev,
        confirmPw: "Passwords do not match.",
      }));
      setPwError("New passwords do not match.");
      return;
    }

    setPwError(null);
    setFieldErrors({ newPw: null, confirmPw: null });
    setSubmitting(true);
    try {
      await changePassword({
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
      // Prefer the server's structured message. Fall back to a network
      // diagnostic so the officer knows whether to retry or contact support.
      let message = err?.response?.data?.message;
      if (!message) {
        if (err?.code === 'ECONNABORTED') {
          message = 'The server took too long to respond. Please try again in a moment.';
        } else if (err?.code === 'ERR_NETWORK') {
          message = 'Could not reach the server. Check your connection and try again.';
        } else {
          message = 'Could not update the password. Please try again.';
        }
      }
      setPwError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#4b5563", fontSize: "13px" }}>
        Loading profile…
      </div>
    );
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
          <div style={{ fontWeight: 700, marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertTriangle size={14} /> Account Suspended
          </div>
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
          <div style={{ fontWeight: 700, marginBottom: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Ban size={14} /> Account Disabled
          </div>
          Your account has been disabled. Contact your NBI supervisor to restore access.
          {profile?.suspendReason ? ` Reason: ${profile.suspendReason}` : ''}
        </div>
      )}

      {/* Profile card */}
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
            <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>
              {profile?.email || "—"}
            </div>
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

      {/* Change password card */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <KeyRound size={14} color="#4b5563" /> CHANGE PASSWORD
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Current password */}
          <div>
            <div style={label}>CURRENT PASSWORD</div>
            <PasswordInput
              value={currentPw}
              onChange={(e) => {
                setCurrentPw(sanitizePw(e.target.value));
                if (pwError) setPwError(null);
              }}
              inputStyle={inputS}
              autoComplete="current-password"
            />
          </div>

          {/* New password */}
          <div>
            <div style={label}>NEW PASSWORD</div>
            <PasswordInput
              value={newPw}
              onChange={(e) => handleNewPwChange(e.target.value)}
              inputStyle={inputS}
              hasError={Boolean(fieldErrors.newPw)}
            />
            {fieldErrors.newPw ? (
              <div
                style={{
                  fontSize: "10px",
                  color: "#ef4444",
                  marginTop: "4px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X size={10} /> {fieldErrors.newPw}
              </div>
            ) : newPw ? (
              <PasswordStrengthMeter value={newPw} />
            ) : (
              <div
                style={{
                  fontSize: "10px",
                  color: "#4b5563",
                  marginTop: "4px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                8–20 characters · Letters + Numbers + Special (!@#$%^&*) · No spaces
              </div>
            )}
          </div>

          {/* Confirm new password */}
          <div>
            <div style={label}>CONFIRM NEW PASSWORD</div>
            <PasswordInput
              value={confirmPw}
              onChange={(e) => handleConfirmPwChange(e.target.value)}
              inputStyle={inputS}
              hasError={Boolean(fieldErrors.confirmPw)}
            />
            {fieldErrors.confirmPw ? (
              <div
                style={{
                  fontSize: "10px",
                  color: "#ef4444",
                  marginTop: "4px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <X size={10} /> {fieldErrors.confirmPw}
              </div>
            ) : confirmPw && newPw === confirmPw ? (
              <div
                style={{
                  fontSize: "10px",
                  color: "#22c55e",
                  marginTop: "4px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Check size={10} /> Passwords match
              </div>
            ) : null}
          </div>

          {/* Top-level error banner (server response, network failure) */}
          {pwError && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                background: "#ef444420",
                border: "1px solid #ef444430",
                color: "#ef4444",
              }}
            >
              {pwError}
            </div>
          )}

          {/* Success banner */}
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
              }}
            >
              <Check size={16} />
              Password updated successfully.
            </div>
          )}

          <button
            onClick={handleUpdatePassword}
            disabled={submitting}
            style={{
              alignSelf: "flex-start",
              padding: "10px 20px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 600,
              background: submitting ? "#2a2a3a" : "#3b82f6",
              color: "#fff",
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {submitting && (
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }}
              />
            )}
            {submitting ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}