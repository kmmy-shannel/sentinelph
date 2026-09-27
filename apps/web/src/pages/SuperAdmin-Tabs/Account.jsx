// apps/web/src/pages/SuperAdmin-Tabs/Account.jsx
import React, { useState, useMemo } from "react";
import {
  KeyRound,
  UserCircle,
  Eye,
  EyeOff,
  Check,
  X,
  LogOut,
} from 'lucide-react';
import { useAuth } from "../../context/AuthContext";
import { changePassword } from "../../lib/api";

const A = "#22c55e"; // superadmin accent (green)

// Maximum password length — must match services/api/routes/account.js
// (MAX_PW_LENGTH = 64). If the two disagree, the client will allow a
// password the server rejects, and the user gets a confusing 400.
const MAX_PW_LENGTH = 64;

// ─── Eye-toggle password input ────────────────────────────────────────
// Owns its own visible/hidden state so toggling one field never reveals
// the others.
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
        maxLength={MAX_PW_LENGTH}
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
function scorePassword(pw) {
  if (!pw) return { score: 0, label: "", color: "#374151" };

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 20) score += 1;

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw);

  if (hasLower && hasUpper) score += 1;
  if (hasNumber) score += 1;
  if (hasSpecial) score += 1;
  if (score > 5) score = 5;

  if (score <= 1) return { score, label: "Very Weak", color: "#ef4444" };
  if (score === 2) return { score, label: "Weak", color: "#f97316" };
  if (score === 3) return { score, label: "Fair", color: "#f59e0b" };
  if (score === 4) return { score, label: "Strong", color: "#22c55e" };
  return { score: 5, label: "Very Strong", color: "#16a34a" };
}

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

      {/* Label + per-criterion checklist */}
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
  const { user, role, logout } = useAuth();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [pwError, setPwError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({
    newPw: null,
    confirmPw: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const card   = { background: "#0e0e18", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "24px", maxWidth: "640px" };
  const label  = { fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em", marginBottom: "6px" };
  const inputS = { width: "100%", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", background: "#080810", border: "1px solid #1a1a2a", color: "#e2e8f0", outline: "none", boxSizing: "border-box" };

  const sanitizePw = (value) => value.replace(/\s/g, "").slice(0, MAX_PW_LENGTH);

  function validatePassword(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (pw.length > MAX_PW_LENGTH)
      return `Password must not exceed ${MAX_PW_LENGTH} characters.`;
    if (!/[a-zA-Z]/.test(pw)) return "Password must include at least 1 letter.";
    if (!/[0-9]/.test(pw)) return "Password must include at least 1 number.";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw))
      return "Password must include at least 1 special character (!@#$%^&*).";
    return null;
  }

  function handleNewPwChange(value) {
    const sanitized = sanitizePw(value);
    setNewPw(sanitized);
    if (pwError) setPwError(null);

    const err = sanitized.length === 0 ? null : validatePassword(sanitized);
    setFieldErrors((prev) => ({
      ...prev,
      newPw: err,
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

  return (
    <div style={{ maxWidth: "640px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Profile */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <UserCircle size={14} color="#4b5563" />
          <span style={{ fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>
            PROFILE
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px 24px", marginBottom: "24px" }}>
          <div>
            <div style={label}>DISPLAY NAME</div>
            <div style={{ fontSize: "13px", color: "#fff" }}>{user?.name ?? "Platform Admin"}</div>
          </div>
          <div>
            <div style={label}>EMAIL</div>
            <div style={{ fontSize: "13px", color: "#fff", fontFamily: "'JetBrains Mono',monospace" }}>{user?.email ?? "admin@sentinelph.gov.ph"}</div>
          </div>
          <div>
            <div style={label}>ROLE</div>
            <div style={{ fontSize: "13px", color: A, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>{(role ?? "superadmin").toUpperCase()}</div>
          </div>
          <div>
            <div style={label}>USER ID</div>
            <div style={{ fontSize: "13px", color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{user?.uid ?? "—"}</div>
          </div>
        </div>

        <button onClick={logout}
          style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#3f1a1a", border: "1px solid #ef444440", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      {/* Change Password */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
          <KeyRound size={14} color="#4b5563" />
          <span style={{ fontSize: "9px", fontWeight: 500, color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>
            CHANGE PASSWORD
          </span>
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
              <div style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                <X size={10} /> {fieldErrors.newPw}
              </div>
            ) : newPw ? (
              <PasswordStrengthMeter value={newPw} />
            ) : (
              <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace" }}>
                8–{MAX_PW_LENGTH} characters · Letters + Numbers + Special (!@#$%^&*) · No spaces
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div>
            <div style={label}>CONFIRM NEW PASSWORD</div>
            <PasswordInput
              value={confirmPw}
              onChange={(e) => handleConfirmPwChange(e.target.value)}
              inputStyle={inputS}
              hasError={Boolean(fieldErrors.confirmPw)}
            />
            {fieldErrors.confirmPw ? (
              <div style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                <X size={10} /> {fieldErrors.confirmPw}
              </div>
            ) : confirmPw && newPw === confirmPw ? (
              <div style={{ fontSize: "10px", color: "#22c55e", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace", display: "flex", alignItems: "center", gap: "4px" }}>
                <Check size={10} /> Passwords match
              </div>
            ) : null}
          </div>

          {/* Top-level error (server response / network failure) */}
          {pwError && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
              {pwError}
            </div>
          )}

          {/* Success banner */}
          {showSuccess && (
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", display: "flex", alignItems: "center", gap: "10px" }}>
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
              background: submitting ? "#2a2a3a" : A,
              color: "#08200f",
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #080810 inset !important;
          -webkit-text-fill-color: #e2e8f0 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}