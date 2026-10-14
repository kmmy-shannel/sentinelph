// apps/web/src/pages/Admin-Tabs/Account.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import {
  KeyRound,
  UserCircle,
  Eye,
  EyeOff,
  Check,
  X,
  Mail,
  RotateCw,
  Shield,
  Clock,
  Building2,
  BadgeCheck,
} from 'lucide-react';
import {
  changePassword,
  requestPasswordChangeOtp,
} from "../../lib/api";

const MAX_PW_LENGTH = 64;

// ─── Admin accent (purple) ────────────────────────────────────────────
const ACCENT = "#a855f7";
const ACCENT_HOVER = "#9333ea";
const ACCENT_TINT_BG = "rgba(168,85,247,0.12)";
const ACCENT_TINT_BORDER = "rgba(168,85,247,0.35)";

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
  if (score === 2) return { score, label: "Weak", color: ACCENT };
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

// ─── 6-digit OTP input ────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled, inputStyle }) {
  const refs = useRef([]);
  const digits = (value + "      ").slice(0, 6).split("");

  const handleChange = (idx, char) => {
    if (char && !/^\d$/.test(char)) return;
    const next = (value + "      ").slice(0, 6).split("");
    next[idx] = char || " ";
    onChange(next.join("").trimEnd());
    if (char && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace") {
      if (digits[idx].trim()) {
        const next = (value + "      ").slice(0, 6).split("");
        next[idx] = " ";
        onChange(next.join("").trimEnd());
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus();
        const next = (value + "      ").slice(0, 6).split("");
        next[idx - 1] = " ";
        onChange(next.join("").trimEnd());
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      refs.current[idx - 1]?.focus();
    } else if (e.key === "ArrowRight" && idx < 5) {
      refs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      e.preventDefault();
      onChange(pasted);
      refs.current[Math.min(pasted.length, 5)]?.focus();
    }
  };

  return (
    <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digits[i].trim()}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          style={{
            ...inputStyle,
            width: "48px",
            height: "56px",
            padding: 0,
            textAlign: "center",
            fontSize: "22px",
            fontWeight: 700,
            fontFamily: "'JetBrains Mono',monospace",
            color: ACCENT,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
      ))}
    </div>
  );
}

// ─── Profile info row (icon + label + value) ─────────────────────────
function InfoRow({ icon: Icon, label, value, mono = false, accent = false }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <div style={{
        width: "28px",
        height: "28px",
        borderRadius: "8px",
        background: accent ? ACCENT_TINT_BG : "#13131e",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        marginTop: "1px",
      }}>
        <Icon size={13} color={accent ? ACCENT : "#64748b"} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "9px",
          fontWeight: 600,
          color: "#64748b",
          fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: "0.08em",
          marginBottom: "3px",
        }}>
          {label}
        </div>
        <div style={{
          fontSize: "13px",
          color: accent ? ACCENT : "#fff",
          fontWeight: accent ? 600 : 500,
          fontFamily: mono ? "'JetBrains Mono',monospace" : "inherit",
          wordBreak: "break-word",
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

export default function AdminAccount({ user }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [otp, setOtp]             = useState("");

  const [step, setStep] = useState(1);
  const [cooldown, setCooldown] = useState(0);

  const [pwError, setPwError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({
    newPw: null,
    confirmPw: null,
    otp: null,
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // Cooldown countdown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

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

  async function handleRequestOtp() {
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
      setFieldErrors((prev) => ({ ...prev, confirmPw: "Passwords do not match." }));
      setPwError("New passwords do not match.");
      return;
    }

    setPwError(null);
    setFieldErrors({ newPw: null, confirmPw: null, otp: null });
    setSendingOtp(true);
    try {
      await requestPasswordChangeOtp({ currentPassword: currentPw });
      setStep(2);
      setCooldown(60);
    } catch (err) {
      let message = err?.response?.data?.message;
      if (!message) {
        if (err?.code === 'ECONNABORTED') {
          message = 'The server took too long to respond. Please try again in a moment.';
        } else if (err?.code === 'ERR_NETWORK') {
          message = 'Could not reach the server. Check your connection and try again.';
        } else {
          message = 'Could not send the verification code. Please try again.';
        }
      }
      setPwError(message);
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleResendOtp() {
    if (cooldown > 0) return;
    setPwError(null);
    setSendingOtp(true);
    try {
      await requestPasswordChangeOtp({ currentPassword: currentPw });
      setOtp("");
      setCooldown(60);
    } catch (err) {
      setPwError(err?.response?.data?.message || 'Could not resend the code.');
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleConfirmChange() {
    if (otp.length !== 6) {
      setFieldErrors((prev) => ({ ...prev, otp: "Enter the 6-digit code." }));
      return;
    }

    setPwError(null);
    setFieldErrors((prev) => ({ ...prev, otp: null }));
    setSubmitting(true);
    try {
      await changePassword({
        currentPassword: currentPw,
        newPassword: newPw,
        confirmPassword: confirmPw,
        otpCode: otp,
      });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setOtp("");
      setStep(1);
      setCooldown(0);
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

      const code = err?.response?.data?.error;
      if (code === 'INVALID_OTP' || code === 'OTP_NOT_FOUND' || code === 'OTP_EXPIRED') {
        setOtp("");
        setFieldErrors((prev) => ({ ...prev, otp: message }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelOtp() {
    setStep(1);
    setOtp("");
    setPwError(null);
    setFieldErrors({ newPw: null, confirmPw: null, otp: null });
  }

  return (
    <div style={{ maxWidth: "680px", display: "flex", flexDirection: "column", gap: "0" }}>

      {/* ─── Header strip ─────────────────────────────────────────── */}
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
        <span style={{
          color: ACCENT,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: "11px",
          letterSpacing: "0.08em",
        }}>
          ACCOUNT
        </span>
        <span style={{ color: "#374151" }}>·</span>
        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
          Profile & security settings
        </span>
      </div>

      {/* ─── Profile card ─────────────────────────────────────────── */}
      <div style={card}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid #13131e",
        }}>
          <UserCircle size={16} color={ACCENT} />
          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#fff",
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "0.08em",
          }}>
            PROFILE
          </span>
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#4b5563" }}>
            Managed by NTC system administrator
          </span>
        </div>

        {/* Identity block */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "28px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 700,
              flexShrink: 0,
              background: ACCENT_TINT_BG,
              color: ACCENT,
              border: `1.5px solid ${ACCENT_TINT_BORDER}`,
            }}
          >
            {user?.initials ?? "AD"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: "16px", marginBottom: "4px" }}>
              {user?.name ?? "Agency Administrator"}
            </div>
            <div style={{
              fontSize: "12px",
              color: "#94a3b8",
              fontFamily: "'JetBrains Mono',monospace",
              wordBreak: "break-all",
            }}>
              {user?.email ?? "—"}
            </div>
            <div style={{ display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" }}>
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: "999px",
                background: ACCENT_TINT_BG,
                color: ACCENT,
                border: `1px solid ${ACCENT_TINT_BORDER}`,
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: "0.04em",
              }}>
                {user?.roleLabel?.toUpperCase() ?? "ADMINISTRATOR"}
              </span>
              <span style={{
                fontSize: "10px",
                fontWeight: 600,
                padding: "3px 9px",
                borderRadius: "999px",
                background: "rgba(34,197,94,0.10)",
                color: "#22c55e",
                border: "1px solid rgba(34,197,94,0.30)",
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: "0.04em",
              }}>
                {user?.statusLabel?.toUpperCase() ?? "ACTIVE"}
              </span>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px 28px",
        }}>
          <InfoRow
            icon={BadgeCheck}
            label="BADGE / ID"
            value={user?.badge ?? "NTC-ADM-0001"}
            mono
          />
          <InfoRow
            icon={Building2}
            label="ORGANIZATION"
            value={user?.agency ?? "NTC Regional Operations"}
          />
          <InfoRow
            icon={Shield}
            label="REGION SCOPE"
            value={user?.regionScope ?? "National"}
            accent
          />
          <InfoRow
            icon={UserCircle}
            label="ROLE"
            value={user?.roleLabel ?? "Agency Administrator"}
          />
          <InfoRow
            icon={Check}
            label="ACCOUNT STATUS"
            value={user?.statusLabel ?? "Active"}
          />
          <InfoRow
            icon={Clock}
            label="LAST LOGIN"
            value={user?.lastLogin ?? "—"}
            mono
          />
        </div>
      </div>

      {/* ─── Change password card ─────────────────────────────────── */}
      <div style={card}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "20px",
          paddingBottom: "16px",
          borderBottom: "1px solid #13131e",
        }}>
          <KeyRound size={16} color={ACCENT} />
          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#fff",
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: "0.08em",
          }}>
            CHANGE PASSWORD
          </span>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono',monospace",
            color: step === 1 ? ACCENT : "#22c55e",
            fontWeight: 700,
          }}>
            <span style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: step === 1 ? ACCENT_TINT_BG : "#0a1a12",
              border: `1px solid ${step === 1 ? ACCENT : "#22c55e"}`,
              color: step === 1 ? ACCENT : "#22c55e",
              fontSize: "10px",
            }}>
              {step === 2 ? <Check size={11} /> : "1"}
            </span>
            NEW PASSWORD
          </div>
          <div style={{ flex: 1, height: "1px", background: step === 2 ? "#22c55e" : "#1a1a2a" }} />
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono',monospace",
            color: step === 2 ? "#22c55e" : "#4b5563",
            fontWeight: 700,
          }}>
            <span style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: step === 2 ? "#0a1a12" : "#080810",
              border: `1px solid ${step === 2 ? "#22c55e" : "#1a1a2a"}`,
              color: step === 2 ? "#22c55e" : "#4b5563",
              fontSize: "10px",
            }}>
              2
            </span>
            VERIFY CODE
          </div>
        </div>

        {step === 1 && (
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
                <div style={{
                  fontSize: "10px",
                  color: "#ef4444",
                  marginTop: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  <X size={10} /> {fieldErrors.newPw}
                </div>
              ) : newPw ? (
                <PasswordStrengthMeter value={newPw} />
              ) : (
                <div style={{
                  fontSize: "10px",
                  color: "#4b5563",
                  marginTop: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}>
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
                <div style={{
                  fontSize: "10px",
                  color: "#ef4444",
                  marginTop: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  <X size={10} /> {fieldErrors.confirmPw}
                </div>
              ) : confirmPw && newPw === confirmPw ? (
                <div style={{
                  fontSize: "10px",
                  color: "#22c55e",
                  marginTop: "6px",
                  fontFamily: "'JetBrains Mono',monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}>
                  <Check size={10} /> Passwords match
                </div>
              ) : null}
            </div>

            {pwError && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                background: "#ef444420",
                border: "1px solid #ef444430",
                color: "#ef4444",
              }}>
                {pwError}
              </div>
            )}

            <button
              onClick={handleRequestOtp}
              disabled={sendingOtp}
              style={{
                alignSelf: "flex-start",
                padding: "11px 22px",
                borderRadius: "10px",
                fontSize: "12px",
                fontWeight: 600,
                background: sendingOtp ? "#2a2a3a" : ACCENT,
                color: sendingOtp ? "#6b7280" : "#fff",
                border: "none",
                cursor: sendingOtp ? "not-allowed" : "pointer",
                marginTop: "6px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => { if (!sendingOtp) e.currentTarget.style.background = ACCENT_HOVER; }}
              onMouseLeave={(e) => { if (!sendingOtp) e.currentTarget.style.background = ACCENT; }}
            >
              {sendingOtp ? (
                <span style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  animation: "spin 0.7s linear infinite",
                  display: "inline-block",
                }} />
              ) : (
                <Mail size={14} />
              )}
              {sendingOtp ? "Sending code…" : "Send verification code"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{
              padding: "14px 16px",
              borderRadius: "10px",
              background: ACCENT_TINT_BG,
              border: `1px solid ${ACCENT_TINT_BORDER}`,
              fontSize: "12px",
              color: "#e9d5ff",
              lineHeight: 1.6,
            }}>
              We sent a 6-digit code to{" "}
              <strong style={{ color: "#fff" }}>{user?.email ?? "your email"}</strong>.
              It expires in <strong style={{ color: "#fff" }}>5 minutes</strong>.
            </div>

            <OtpInput value={otp} onChange={setOtp} disabled={submitting} inputStyle={inputS} />

            {fieldErrors.otp && (
              <div style={{
                fontSize: "10px",
                color: "#ef4444",
                textAlign: "center",
                fontFamily: "'JetBrains Mono',monospace",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}>
                <X size={10} /> {fieldErrors.otp}
              </div>
            )}

            {pwError && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                background: "#ef444420",
                border: "1px solid #ef444430",
                color: "#ef4444",
              }}>
                {pwError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleConfirmChange}
                disabled={submitting || otp.length !== 6}
                style={{
                  padding: "11px 22px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: submitting || otp.length !== 6 ? "#2a2a3a" : "#22c55e",
                  color: submitting || otp.length !== 6 ? "#6b7280" : "#08200f",
                  border: "none",
                  cursor: submitting || otp.length !== 6 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {submitting ? (
                  <span style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    border: "2px solid rgba(8,32,15,0.3)",
                    borderTopColor: "#08200f",
                    animation: "spin 0.7s linear infinite",
                    display: "inline-block",
                  }} />
                ) : (
                  <Check size={14} />
                )}
                {submitting ? "Updating…" : "Confirm & Update Password"}
              </button>

              <button
                onClick={handleResendOtp}
                disabled={cooldown > 0 || sendingOtp}
                style={{
                  padding: "11px 16px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "transparent",
                  border: "1px solid #1a1a2a",
                  color: cooldown > 0 ? "#4b5563" : "#9ca3af",
                  cursor: cooldown > 0 || sendingOtp ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <RotateCw size={12} />
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>

              <button
                onClick={handleCancelOtp}
                disabled={submitting}
                style={{
                  padding: "11px 16px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  background: "transparent",
                  border: "none",
                  color: "#6b7280",
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {showSuccess && (
          <div style={{
            marginTop: "16px",
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
          }}>
            <Check size={16} />
            Password updated successfully.
          </div>
        )}
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