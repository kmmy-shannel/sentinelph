// apps/web/src/pages/Officer-Tabs/Account.jsx
import { useState } from "react";
import { ShieldCheck, KeyRound, UserCircle } from 'lucide-react';

export default function Account({ user }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw]         = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const fields = [
    { l: "BADGE / ID",             v: user?.badge ?? "NBI-CCRU-0041" },
    { l: "ORGANIZATION",           v: "NBI Cybercrime Research Unit" },
    { l: "ASSIGNED JURISDICTION",  v: "NCR" },
    { l: "ROLE",                   v: "Cybercrime Officer" },
    { l: "ACCOUNT STATUS",         v: "Active — MFA Verified" },
    { l: "LAST LOGIN",             v: "Aug 28 09:05 PST" },
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

  function handleUpdatePassword() {
    if (!currentPw || !newPw || !confirmPw) {
      setOtpError("Please fill in all fields.");
      return;
    }
    const validation = validatePassword(newPw);
    if (validation) {
      setOtpError(validation);
      return;
    }
    if (newPw !== confirmPw) {
      setOtpError("New passwords do not match.");
      return;
    }
    setOtpError(null);
    setShowOtp(true);
  }

  function handleOtpSubmit() {
    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      setOtpError("Please enter a valid 6-digit OTP.");
      return;
    }
    setOtpError(null);
    setShowOtp(false);
    setOtp("");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  }

  return (
    <div style={{ maxWidth: "640px" }}>

      {/* Profile */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <UserCircle size={14} color="#4b5563" /> PROFILE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 700, flexShrink: 0, background: "#1e3a5f", color: "#60a5fa", border: "1.5px solid #3b82f640" }}>
            {user?.initials ?? "RC"}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#fff" }}>{user?.name ?? "Insp. R. Cruz"}</div>
            <div style={{ fontSize: "12px", marginTop: "2px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace" }}>{user?.email ?? "r.cruz@nbi-ccru.gov.ph"}</div>
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

      {/* MFA */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldCheck size={14} color="#4b5563" /> MULTI-FACTOR AUTHENTICATION
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#fff", fontSize: "14px" }}>Email OTP</div>
            <div style={{ fontSize: "12px", marginTop: "4px", color: "#4b5563" }}>A 6-digit code is sent to your registered email on each login.</div>
          </div>
          <div style={{ width: "40px", height: "24px", borderRadius: "999px", background: "#22c55e", display: "flex", alignItems: "center", padding: "0 2px", flexShrink: 0 }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: "#fff", marginLeft: "auto" }} />
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#0a1a12", border: "1px solid #22c55e30", color: "#22c55e" }}>
          ✓ Email OTP active — Last verified Aug 15, 2026
        </div>
      </div>

      {/* Change password */}
      <div style={card}>
        <div style={{ ...label, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
          <KeyRound size={14} color="#4b5563" /> CHANGE PASSWORD
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <div style={label}>CURRENT PASSWORD</div>
            <input 
              type="password" 
              value={currentPw} 
              onChange={(e) => setCurrentPw(sanitizePw(e.target.value))}
              autoComplete="new-password"
              style={inputS} 
            />
          </div>
          <div>
            <div style={label}>NEW PASSWORD</div>
            <input 
              type="password" 
              value={newPw} 
              onChange={(e) => setNewPw(sanitizePw(e.target.value))}
              autoComplete="new-password"
              style={inputS} 
            />
            <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "4px", fontFamily: "'JetBrains Mono',monospace" }}>
              8–20 characters · Letters + Numbers + Special (!@#$%^&*) · No spaces
            </div>
          </div>
          <div>
            <div style={label}>CONFIRM NEW PASSWORD</div>
            <input 
              type="password" 
              value={confirmPw} 
              onChange={(e) => setConfirmPw(sanitizePw(e.target.value))}
              autoComplete="new-password"
              style={inputS} 
            />
          </div>

          {otpError && !showOtp && (
            <div style={{ padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
              {otpError}
            </div>
          )}

          {showSuccess && (
            <div style={{ 
              padding: "12px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 500,
              background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e",
              display: "flex", alignItems: "center", gap: "10px", animation: "fadeIn 0.3s ease"
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Password updated successfully.
            </div>
          )}

          <button onClick={handleUpdatePassword}
            style={{ alignSelf: "flex-start", padding: "10px 20px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer", marginTop: "4px" }}>
            Update Password
          </button>
        </div>
      </div>

      {/* OTP MODAL */}
      {showOtp && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowOtp(false)}>
          <div style={{ width: "100%", maxWidth: "440px", margin: "0 16px", borderRadius: "20px", padding: "32px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: "linear-gradient(90deg,transparent,#3b82f6,transparent)" }} />

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontWeight: 700, color: "#fff", fontSize: "18px" }}>OTP Verification</div>
              <div style={{ fontSize: "12px", marginTop: "6px", color: "#4b5563", lineHeight: 1.6 }}>
                A 6-digit code has been sent to <span style={{ color: "#3b82f6", fontWeight: 600 }}>{user?.email ?? "r.cruz@nbi-ccru.gov.ph"}</span>. Enter it below to confirm the password change.
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", marginBottom: "8px", color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>6-DIGIT OTP</div>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                autoComplete="off"
                style={{
                  width: "100%", padding: "14px", borderRadius: "12px",
                  fontSize: "24px", textAlign: "center", letterSpacing: "8px",
                  background: "#080810", border: "1.5px solid #1a1a2a",
                  color: "#fff", outline: "none", fontFamily: "'JetBrains Mono',monospace",
                  boxSizing: "border-box"
                }}
              />
            </div>

            {otpError && (
              <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
                {otpError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => { setShowOtp(false); setOtp(""); setOtpError(null); }}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#111120", border: "1px solid #1a1a2a", color: "#9ca3af", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleOtpSubmit}
                style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, background: "#3b82f6", border: "none", color: "#fff", cursor: "pointer" }}>
                Verify & Update
              </button>
            </div>

            <div style={{ textAlign: "center", fontSize: "11px", marginTop: "16px", color: "#4b5563" }}>
              Didn't receive the code? <span style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}>Resend OTP</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
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