import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../config/firebase";
import api from "../lib/api";

const accent = "#3b82f6";

function PasswordRule({ met, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: met ? "#22c55e" : "#4b5563" }}>
      <span style={{
        width: "14px", height: "14px", borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: met ? "#22c55e20" : "transparent", border: `1px solid ${met ? "#22c55e" : "#374151"}`,
      }}>
        {met && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4l2 2 4-4" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </div>
  );
}

export default function Activate() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get("mode");
  const oobCode = searchParams.get("oobCode");

  const [stage, setStage] = useState("checking"); // checking | invalid | ready | submitting | success | error
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const allRulesMet = Object.values(rules).every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirmPw;
  const canSubmit = allRulesMet && passwordsMatch && stage === "ready";

  useEffect(() => {
    async function checkCode() {
      if (mode !== "resetPassword" || !oobCode) {
        setStage("invalid");
        return;
      }
      try {
        const accountEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(accountEmail);
        setStage("ready");
      } catch (err) {
        console.error("[Activate] Invalid or expired code:", err);
        setStage("invalid");
      }
    }
    checkCode();
  }, [mode, oobCode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setStage("submitting");

    try {
      // 1. Actually set the new password on the Firebase account.
      await confirmPasswordReset(auth, oobCode, password);

      // 2. confirmPasswordReset does NOT sign the user in — do that explicitly
      //    so we hold a valid ID token to call our own backend next.
      await signInWithEmailAndPassword(auth, email, password);

      // 3. Flip status: pending_activation -> active in Mongo.
      await api.post("/auth/activate-account");

      setStage("success");
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      console.error("[Activate] Activation failed:", err);
      if (err.code === "auth/expired-action-code" || err.code === "auth/invalid-action-code") {
        setStage("invalid");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please choose a stronger password.");
        setStage("ready");
      } else {
        setError("Something went wrong while activating your account. Please try again.");
        setStage("ready");
      }
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#06060f", fontFamily: "'Inter',sans-serif", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "440px", borderRadius: "20px", padding: "40px", background: "#0b0b16", border: "1px solid #16162a", boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "16px", color: "#fff", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 0 20px #4f46e540" }}>S</div>
          <div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "15px" }}>SentinelPH</div>
            <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em" }}>ACCOUNT ACTIVATION</div>
          </div>
        </div>

        {stage === "checking" && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280", fontSize: "14px" }}>
            Verifying your activation link…
          </div>
        )}

        {stage === "invalid" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#ef4444", marginBottom: "8px" }}>Link Invalid or Expired</div>
            <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6, marginBottom: "20px" }}>
              This activation link has expired or has already been used. Contact your system administrator to request a new invitation.
            </p>
            <button onClick={() => navigate("/login")} style={{ padding: "12px 24px", borderRadius: "10px", border: "none", background: accent, color: "#fff", fontWeight: 600, cursor: "pointer" }}>
              Back to Login
            </button>
          </div>
        )}

        {stage === "success" && (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#22c55e20", border: "1px solid #22c55e40", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>Account Activated</div>
            <p style={{ fontSize: "13px", color: "#6b7280" }}>Redirecting you to sign in…</p>
          </div>
        )}

        {(stage === "ready" || stage === "submitting") && (
          <>
            <p style={{ fontSize: "13px", color: "#4b5563", marginBottom: "20px" }}>
              Setting a password for <strong style={{ color: "#e5e7eb" }}>{email}</strong>
            </p>

            {error && (
              <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444", fontSize: "13px", marginBottom: "16px" }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", marginBottom: "8px", fontWeight: 500, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>NEW PASSWORD</div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter a new password"
                    autoFocus
                    style={{ width: "100%", padding: "14px 48px 14px 16px", borderRadius: "12px", fontSize: "14px", background: "#080810", border: "1.5px solid #1c1c2e", color: "#e2e8f0", outline: "none", boxSizing: "border-box" }}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "12px" }}>
                    {showPass ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "11px", marginBottom: "8px", fontWeight: 500, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>CONFIRM PASSWORD</div>
                <input
                  type={showPass ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter your password"
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: "12px", fontSize: "14px",
                    background: "#080810",
                    border: `1.5px solid ${confirmPw.length > 0 ? (passwordsMatch ? "#22c55e60" : "#ef444460") : "#1c1c2e"}`,
                    color: "#e2e8f0", outline: "none", boxSizing: "border-box",
                  }}
                />
                {confirmPw.length > 0 && !passwordsMatch && (
                  <div style={{ fontSize: "11px", color: "#ef4444", marginTop: "6px" }}>Passwords do not match.</div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "14px 16px", borderRadius: "10px", background: "#080810", border: "1px solid #1c1c2e", marginBottom: "20px" }}>
                <PasswordRule met={rules.length} label="At least 8 characters" />
                <PasswordRule met={rules.upper} label="One uppercase letter" />
                <PasswordRule met={rules.lower} label="One lowercase letter" />
                <PasswordRule met={rules.number} label="One number" />
              </div>

              <button
                type="submit"
                disabled={!canSubmit || stage === "submitting"}
                style={{
                  width: "100%", padding: "15px", borderRadius: "12px", fontSize: "14px", fontWeight: 700, border: "none",
                  background: canSubmit ? accent : "#111118",
                  color: canSubmit ? "#fff" : "#374151",
                  cursor: canSubmit ? "pointer" : "not-allowed",
                }}
              >
                {stage === "submitting" ? "Activating…" : "Set Password & Activate"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}