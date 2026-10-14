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
  Shield,
  Clock,
  BadgeCheck,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { changePassword } from "../../lib/api";

// ─── SuperAdmin accent (green) ────────────────────────────────────────
const A = "#22c55e";
const A_HOVER = "#16a34a";
const A_TINT = "rgba(34,197,94,0.12)";
const A_TINT_BORDER = "rgba(34,197,94,0.35)";

const MAX_PW_LENGTH = 64;

// ─── Person silhouette (replaces "SA" initials in the identity block) ─
function PersonIcon({ size = 30, color = A }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

// ─── Eye-toggle password input ────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
  inputStyle,
  hasError = false,
  disabled = false,
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
        disabled={disabled}
        maxLength={MAX_PW_LENGTH}
        style={{
          ...inputStyle,
          paddingRight: "42px",
          borderColor: hasError ? "#ef4444" : inputStyle.border,
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "text",
        }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: "10px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          padding: "4px",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4b5563",
          opacity: disabled ? 0.4 : 1,
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
  if (score === 2) return { score, label: "Weak", color: A };
  if (score === 3) return { score, label: "Fair", color: "#f59e0b" };
  if (score === 4) return { score, label: "Strong", color: "#22c55e" };
  return { score: 5, label: "Very Strong", color: "#16a34a" };
}

function PasswordStrengthMeter({ value }) {
  const { score, label, color } = useMemo(() => scorePassword(value), [value]);
  if (!value) return null;

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", gap: "4px", height: "4px", marginBottom: "6px" }}>
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

// ─── Profile info row ────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, mono = false, accent = false }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: accent ? A_TINT : "#13131e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: "1px",
        }}
      >
        <Icon size={13} color={accent ? A : "#64748b"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "9px",
            fontWeight: 600,
            color: "#64748b",
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "0.08em",
            marginBottom: "3px",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "13px",
            color: accent ? A : "#fff",
            fontWeight: accent ? 600 : 500,
            fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
            wordBreak: "break-word",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  const { user, role, logout } = useAuth();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const [pwError, setPwError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({
    newPw: null,
    confirmPw: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const card = {
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "20px",
    background: "#0e0e18",
    border: "1px solid #1a1a2a",
  };
  const label = {
    fontSize: "9px",
    fontWeight: 600,
    marginBottom: "6px",
    color: "#64748b",
    fontFamily: "'JetBrains Mono',monospace",
    letterSpacing: "0.08em",
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
        if (err?.code === "ECONNABORTED") {
          message = "The server took too long to respond. Please try again in a moment.";
        } else if (err?.code === "ERR_NETWORK") {
          message = "Could not reach the server. Check your connection and try again.";
        } else {
          message = "Could not update the password. Please try again.";
        }
      }
      setPwError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = user?.name ?? user?.displayName ?? "Platform Admin";
  const displayEmail = user?.email ?? "admin@sentinelph.gov.ph";
  const userUid = user?.uid ?? "—";

  return (
    <div
      style={{
        maxWidth: "680px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "12px 16px",
          borderRadius: "10px",
          background: "#0a0a12",
          border: "1px solid #1a1a2a",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <span
          style={{
            color: A,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: "11px",
            letterSpacing: "0.08em",
          }}
        >
          ACCOUNT
        </span>
        <span style={{ color: "#374151" }}>·</span>
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
          Profile & security settings
        </span>
      </div>

      {/* Profile card */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "24px",
            paddingBottom: "16px",
            borderBottom: "1px solid #13131e",
          }}
        >
          <UserCircle size={16} color={A} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#fff",
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: "0.08em",
            }}
          >
            PROFILE
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              color: "#4b5563",
            }}
          >
            Platform-level administrator
          </span>
        </div>

        {/* Identity block — person icon instead of initials */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: A_TINT,
              border: `1.5px solid ${A_TINT_BORDER}`,
            }}
            aria-hidden="true"
          >
            <PersonIcon size={30} color={A} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: 700,
                color: "#fff",
                fontSize: "16px",
                marginBottom: "4px",
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                fontFamily: "'JetBrains Mono',monospace",
                wordBreak: "break-all",
              }}
            >
              {displayEmail}
            </div>
            <div
              style={{
                display: "flex",
                gap: "6px",
                marginTop: "10px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: A_TINT,
                  color: A,
                  border: `1px solid ${A_TINT_BORDER}`,
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.04em",
                }}
              >
                {(role ?? "superadmin").toUpperCase()}
              </span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "3px 9px",
                  borderRadius: "999px",
                  background: "rgba(34,197,94,0.10)",
                  color: "#22c55e",
                  border: "1px solid rgba(34,197,94,0.30)",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: "0.04em",
                }}
              >
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "20px 28px",
            marginBottom: "24px",
          }}
        >
          <InfoRow
            icon={UserCircle}
            label="DISPLAY NAME"
            value={displayName}
          />
          <InfoRow
            icon={UserCircle}
            label="EMAIL"
            value={displayEmail}
            mono
          />
          <InfoRow
            icon={Shield}
            label="ROLE"
            value={(role ?? "superadmin").toUpperCase()}
            accent
          />
          <InfoRow
            icon={BadgeCheck}
            label="USER ID"
            value={userUid}
            mono
          />
          <InfoRow
            icon={Check}
            label="ACCOUNT STATUS"
            value="Active"
          />
          <InfoRow
            icon={Clock}
            label="SESSION"
            value="Authenticated"
          />
        </div>

        <button
          onClick={logout}
          style={{
            padding: "10px 20px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: 600,
            background: "#3f1a1a",
            border: "1px solid #ef444440",
            color: "#ef4444",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>

      {/* Change password card */}
      <div style={card}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "20px",
            paddingBottom: "16px",
            borderBottom: "1px solid #13131e",
          }}
        >
          <KeyRound size={16} color={A} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#fff",
              fontFamily: "'JetBrains Mono',monospace",
              letterSpacing: "0.08em",
            }}
          >
            CHANGE PASSWORD
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "11px",
              color: "#4b5563",
            }}
          >
            Single-step · no email verification
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
                  marginTop: "6px",
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
                  marginTop: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                8–{MAX_PW_LENGTH} chars · letter + number + special (!@#$%^&*) · no spaces
              </div>
            )}
          </div>

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
                  marginTop: "6px",
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
                  marginTop: "6px",
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
              padding: "11px 22px",
              borderRadius: "10px",
              fontSize: "12px",
              fontWeight: 600,
              background: submitting ? "#2a2a3a" : A,
              color: submitting ? "#6b7280" : "#08200f",
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              marginTop: "6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!submitting) e.currentTarget.style.background = A_HOVER;
            }}
            onMouseLeave={(e) => {
              if (!submitting) e.currentTarget.style.background = A;
            }}
          >
            {submitting && (
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  border: "2px solid rgba(8,32,15,0.3)",
                  borderTopColor: "#08200f",
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