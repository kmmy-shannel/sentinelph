// apps/web/src/pages/Login.jsx
import { useState, useRef, useEffect } from "react";

import { useAuth, ROLES } from "../context/AuthContext";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";

const ShieldIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const MagnifyIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ScalesIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18M5 7l7-4 7 4M5 7l-3 7h6L5 7zM19 7l-3 7h6l-3-7z" />
  </svg>
);

const ROLE_OPTIONS = [
  { id: ROLES.OFFICER, label: "Barangay / NBI Officer", dept: "NBI Cybercrime Division", Icon: ShieldIcon, color: "#3b82f6", path: "/officer/dashboard" },
  { id: ROLES.ADMIN, label: "Agency Admin", dept: "NTC Fraud Research Division", Icon: MagnifyIcon, color: "#a855f7", path: "/admin/dashboard" },
  { id: ROLES.SUPERADMIN, label: "System Super Admin", dept: "DICT Independent Auditor", Icon: ScalesIcon, color: "#22c55e", path: "/superadmin/dashboard" },
];

const DEMO_USERS = {
  officer: { name: "Insp. R. Cruz", badge: "NBI-CCRU-0041", email: "r.cruz@nbi-ccru.gov.ph", dept: "NBI Cybercrime Division", initials: "RC" },
  admin: { name: "Ana Mercado", badge: "NTC-FRO-0018", email: "a.mercado@ntc.gov.ph", dept: "NTC Fraud Research Division", initials: "AM" },
  superadmin: { name: "Dr. J. Santos", badge: "DICT-AUD-0903", email: "j.santos@dict.gov.ph", dept: "DICT Independent Auditor", initials: "JS" },
};

function RoleDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = ROLE_OPTIONS.find((r) => r.id === value);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "12px",
          padding: "14px 16px", borderRadius: "12px", fontSize: "14px",
          background: "#080810",
          border: `1.5px solid ${open ? (selected?.color ?? "#6366f1") + "80" : "#1c1c2e"}`,
          color: selected ? "#e2e8f0" : "#4b5563",
          boxShadow: open ? `0 0 0 3px ${(selected?.color ?? "#6366f1")}14` : "none",
          cursor: "pointer", transition: "all 0.2s", textAlign: "left",
        }}
      >
        {selected ? (
          <>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: selected.color + "18" }}>
              <selected.Icon color={selected.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, color: "#fff", fontSize: "13px" }}>{selected.label}</div>
              <div style={{ fontSize: "11px", marginTop: "2px", color: selected.color, fontFamily: "'JetBrains Mono',monospace" }}>{selected.dept}</div>
            </div>
          </>
        ) : (
          <span style={{ flex: 1, color: "#4b5563" }}>Select your assigned role…</span>
        )}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s", flexShrink: 0 }}>
          <path d="M3 5l4 4 4-4" stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
          background: "#0d0d1a", border: "1.5px solid #1c1c2e", borderRadius: "12px",
          overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.6)", zIndex: 50,
        }}>
          {ROLE_OPTIONS.map((role, i) => (
            <button
              key={role.id}
              type="button"
              onClick={() => { onChange(role.id); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "12px",
                padding: "14px 16px", textAlign: "left", cursor: "pointer",
                borderBottom: i < ROLE_OPTIONS.length - 1 ? "1px solid #13131e" : "none",
                background: value === role.id ? role.color + "12" : "transparent",
                transition: "background 0.3s",
                animation: `slideDown ${0.3 + (i * 0.3)}s ease forwards`,
                opacity: 0,
              }}
              onMouseEnter={(e) => { if (value !== role.id) e.currentTarget.style.background = "#13131e"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = value === role.id ? role.color + "12" : "transparent"; }}
            >
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: role.color + "18" }}>
                <role.Icon color={role.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "#fff" }}>{role.label}</div>
                <div style={{ fontSize: "11px", marginTop: "2px", color: role.color, fontFamily: "'JetBrains Mono',monospace", opacity: 0.85 }}>{role.dept}</div>
              </div>
              {value === role.id && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7l3.5 3.5 5.5-6" stroke={role.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Login() {
const { isAuthenticated, role: authRole, loading: authLoading, requestPasswordReset } = useAuth();
  const [role, setRole] = useState("");
 const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [error, setError] = useState(null);

  // Forgot Password state
  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  
  
  const [forgotError, setForgotError] = useState(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const selectedRole = ROLE_OPTIONS.find((r) => r.id === role);
  const accent = selectedRole?.color ?? "#6366f1";
 const canSubmit = role && email && password && !loading;
 


    useEffect(() => {
    if (!authLoading && isAuthenticated && authRole) {
      const roleData = ROLE_OPTIONS.find(r => r.id === authRole);
      window.location.href = roleData?.path || '/unauthorized';
    }
  }, [authLoading, isAuthenticated, authRole]);

  const sanitizePw = (value) => value.replace(/\s/g, "");
  const sanitizeBadge = (value) => value.toUpperCase().replace(/\s/g, "");

  const inputStyle = (name) => ({
    width: "100%", padding: "14px 18px", borderRadius: "12px", fontSize: "14px",
    background: "#080810",
    border: `1.5px solid ${focusField === name ? accent + "80" : "#1c1c2e"}`,
    color: "#e2e8f0", outline: "none",
    boxShadow: focusField === name ? `0 0 0 3px ${accent}14` : "none",
    transition: "all 0.3s", boxSizing: "border-box",
  });

 async function handleSubmit(e) {
  e.preventDefault();
  if (!canSubmit) return;

  setError(null);
  setLoading(true);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const tokenResult = await cred.user.getIdTokenResult(true);
    const actualRole = tokenResult.claims.role;

    if (!actualRole) {
      await auth.signOut();
      setError('Your account has no assigned role. Contact your system administrator.');
      setLoading(false);
      return;
    }

    if (actualRole !== role) {
      await auth.signOut();
      const correctPortal = ROLE_OPTIONS.find(r => r.id === actualRole)?.label || actualRole;
      setError(`This account is registered as "${correctPortal}", not the portal you selected.`);
      setLoading(false);
      return;
    }

     // Success — AuthContext's onAuthStateChanged will pick up the new
    // role via getIdTokenResult, which triggers the redirect effect
    // above. No manual navigation here, so there's no race.
  } catch (err) {
    console.error('[Login] Firebase sign-in failed:', err);
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
      setError('Invalid email or password.');
    } else if (err.code === 'auth/too-many-requests') {
      setError('Too many failed attempts. Please try again later.');
    } else {
      setError('Login failed. Please try again.');
    }
    setLoading(false);
  }
}

  return (
    <div id="login-page" className="login-container" style={{ width: "100%", minHeight: "100vh", display: "flex", overflow: "hidden", fontFamily: "'Inter',sans-serif", background: "#06060f", position: "relative", animation: "fadeIn 0.5s ease" }}>

      <div style={{ 
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(rgba(15,15,30,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(15,15,30,0.9) 1px, transparent 1px)", 
        backgroundSize: "52px 52px"
      }} />

      <div style={{ 
        position: "absolute", width: "550px", height: "550px", borderRadius: "50%", 
        filter: "blur(120px)", pointerEvents: "none", zIndex: 0,
        background: accent + "15", 
        animation: "floatGlow 12s infinite ease-in-out",
        transition: "background 1s"
      }} />

      <div style={{ 
        position: "absolute", width: "350px", height: "350px", borderRadius: "50%", 
        filter: "blur(100px)", pointerEvents: "none", zIndex: 0,
        background: "#3730a318", 
        animation: "floatGlow2 15s infinite ease-in-out"
      }} />

      <div className="login-left-panel" style={{ width: "42%", flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "16px", color: "#fff", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 0 20px #4f46e540" }}>S</div>
          <div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "15px", letterSpacing: "-0.01em" }}>SentinelPH</div>
            <div style={{ fontSize: "10px", color: "#374151", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em" }}>WEB CONTROL CENTER</div>
          </div>
        </div>

        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 12px", borderRadius: "999px", marginBottom: "24px", fontSize: "11px", fontWeight: 500, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono',monospace", background: accent + "15", border: `1px solid ${accent}30`, color: accent }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, display: "inline-block" }} />
            AUTHORIZED PERSONNEL ONLY
          </div>
          <h1 style={{ fontWeight: 800, color: "#fff", lineHeight: 1.05, marginBottom: "20px", fontSize: "clamp(28px,3vw,46px)", letterSpacing: "-0.03em" }}>
            Integrated Scam<br />Detection &<br />
            <span style={{ color: accent, transition: "color 0.5s" }}>Reporting Platform</span>
          </h1>
          <p style={{ fontSize: "14px", lineHeight: 1.8, color: "#4b5563", maxWidth: "420px", marginBottom: "36px" }}>
            Access is scoped to your jurisdiction and permissions. All sessions are cryptographically logged and tamper-evident. Monitor, review, and act on scam reports across the Philippines in real time.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", padding: "24px", borderRadius: "16px", background: "#0d0d18", border: "1px solid #13131e" }}>
            {[{ v: "48,291", l: "Reports Filed" }, { v: "1,843", l: "Cases Closed" }, { v: "99.97%", l: "Uptime" }].map((s) => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 800, color: "#fff", fontSize: "18px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
                <div style={{ fontSize: "11px", marginTop: "4px", color: "#374151" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ fontSize: "11px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>System Operational · v2.4.1</span>
          </div>
          <p style={{ fontSize: "11px", color: "#1f2937", lineHeight: 1.6 }}>
            Unauthorized access is a criminal offense under RA 10175<br />
            Philippine Cybercrime Prevention Act
          </p>
        </div>
      </div>

      <div className="login-right-panel" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative", zIndex: 1, minWidth: 0 }}>
        <div style={{ width: "100%", maxWidth: "480px" }}>
          <div style={{ borderRadius: "20px", padding: "40px", position: "relative", background: "#0b0b16", border: "1px solid #16162a", boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${accent},transparent)`, transition: "background 0.5s" }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ marginBottom: "28px" }}>
                <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "6px", letterSpacing: "-0.02em" }}>Sign In</h2>
                <p style={{ fontSize: "13px", color: "#4b5563" }}>Select your role and enter your credentials.</p>
              </div>

              {error && (
                <div style={{
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "#ef444420",
                  border: "1px solid #ef444430",
                  color: "#ef4444",
                  fontSize: "14px",
                  marginBottom: "16px"
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "18px" }}>
                  <div style={{ fontSize: "11px", marginBottom: "8px", fontWeight: 500, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>ASSIGNED ROLE</div>
                  <RoleDropdown value={role} onChange={setRole} />
                </div>

                <div style={{ marginBottom: "18px" }}>
  <div style={{ fontSize: "11px", marginBottom: "8px", fontWeight: 500, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>EMAIL ADDRESS</div>
  <input
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value.trim())}
    placeholder="e.g. r.cruz@nbi-ccru.gov.ph"
    onFocus={() => setFocusField("email")}
    onBlur={() => setFocusField(null)}
    autoComplete="username"
    style={inputStyle("email")}
  />
</div>

                <div style={{ marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 500, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>PASSWORD</div>
                  <button
  type="button"
  onClick={() => {
    setShowForgotPw(true);
    setForgotEmail("");
    setForgotError(null);
    setForgotSuccess(false);
    setForgotLoading(false);
  }}
  style={{ fontSize: "12px", fontWeight: 600, color: accent, background: "none", border: "none", cursor: "pointer" }}
>
  Forgot password?
</button>
                  </div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(sanitizePw(e.target.value))}
                      placeholder="Enter your password"
                      onFocus={() => setFocusField("password")}
                      onBlur={() => setFocusField(null)}
                      autoComplete="new-password"
                      style={{ ...inputStyle("password"), paddingRight: "48px" }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                      {showPass ? (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#6b7280" strokeWidth="1.2" />
                          <circle cx="8" cy="8" r="2" stroke="#6b7280" strokeWidth="1.2" />
                          <line x1="2" y1="14" x2="14" y2="2" stroke="#6b7280" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#6b7280" strokeWidth="1.2" />
                          <circle cx="8" cy="8" r="2" stroke="#6b7280" strokeWidth="1.2" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div style={{ fontSize: "10px", color: "#4b5563", marginTop: "6px", fontFamily: "'JetBrains Mono',monospace" }}>
                    No spaces allowed
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    width: "100%", padding: "15px", borderRadius: "12px", fontSize: "14px", fontWeight: 700, border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "24px",
                    background: canSubmit ? `linear-gradient(135deg,${accent},${accent}cc)` : "#111118",
                    color: canSubmit ? "#fff" : "#374151",
                    boxShadow: canSubmit ? `0 0 30px ${accent}35` : "none",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    transition: "all 0.3s",
                  }}
                >
                  {loading && <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0 }} />}
                  {loading ? "Authenticating…" : "Sign In to SentinelPH"}
                </button>
              </form>

              <p style={{ textAlign: "center", fontSize: "12px", marginTop: "24px", color: "#374151" }}>
                No account? <span style={{ color: "#4b5563" }}>Contact your system administrator to request access.</span>
              </p>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "11px", marginTop: "16px", color: "#1f2937" }}>
            Protected under RA 10175 · Philippine Cybercrime Prevention Act
          </p>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotPw && (
  <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
    <div style={{ width: "100%", maxWidth: "440px", margin: "0 16px", borderRadius: "20px", padding: "32px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />

      <button
        onClick={() => setShowForgotPw(false)}
        style={{ position: "absolute", top: "16px", right: "16px", color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
        aria-label="Close"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
          Reset Password
        </div>
        <div style={{ fontSize: "13px", color: "#4b5563", lineHeight: 1.6 }}>
          {forgotSuccess
            ? `If an account exists for ${forgotEmail}, we've sent a password reset link. Check your inbox.`
            : "Enter your registered email address. We'll send you a secure link to reset your password."}
        </div>
      </div>

      {forgotSuccess ? (
        <div style={{ padding: "16px", borderRadius: "12px", background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", textAlign: "center" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "8px" }}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Check your inbox</div>
          <div style={{ fontSize: "12px", opacity: 0.85, lineHeight: 1.5 }}>
            The link expires in 15 minutes and can only be used once.
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 500, color: "#6b7280", marginBottom: "8px", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>EMAIL ADDRESS</div>
            <input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="your.email@gov.ph"
              autoFocus
              disabled={forgotLoading}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: "12px", fontSize: "14px",
                background: "#080810",
                border: `1.5px solid ${focusField === "forgot-email" ? accent + "80" : "#1c1c2e"}`,
                color: "#e2e8f0", outline: "none", boxSizing: "border-box",
                opacity: forgotLoading ? 0.6 : 1,
              }}
              onFocus={() => setFocusField("forgot-email")}
              onBlur={() => setFocusField(null)}
            />
          </div>

          {forgotError && (
            <div style={{ marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", fontSize: "12px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
              {forgotError}
            </div>
          )}

          <button
            type="button"
            disabled={forgotLoading}
            onClick={async () => {
              if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
                setForgotError("Please enter a valid email address.");
                return;
              }
              setForgotError(null);
              setForgotLoading(true);
              try {
                await requestPasswordReset(forgotEmail.trim().toLowerCase());
                setForgotSuccess(true);
              } catch (err) {
                // Even on failure, we show the same success state to prevent enumeration.
                setForgotSuccess(true);
              } finally {
                setForgotLoading(false);
              }
            }}
            style={{
              width: "100%", padding: "14px", borderRadius: "12px", fontSize: "14px",
              fontWeight: 700, border: "none",
              background: forgotLoading ? "#2a2a3a" : accent,
              color: "#fff",
              cursor: forgotLoading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
            }}
          >
            {forgotLoading && (
              <span style={{ width: "14px", height: "14px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            )}
            {forgotLoading ? "Sending…" : "Send Reset Link"}
          </button>
        </>
      )}
    </div>
  </div>
)}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatGlow {
          0% { top: 10%; left: 25%; opacity: 0.4; }
          50% { top: 55%; left: 75%; opacity: 0.8; }
          100% { top: 20%; left: 35%; opacity: 0.4; }
        }
        @keyframes floatGlow2 {
          0% { bottom: 25%; right: 10%; opacity: 0.3; }
          50% { bottom: 65%; right: 45%; opacity: 0.6; }
          100% { bottom: 35%; right: 20%; opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus, 
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #080810 inset !important;
          -webkit-text-fill-color: #e2e8f0 !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        @media (max-width: 1024px) {
          .login-container {
            flex-direction: column !important;
            overflow-y: auto !important;
          }
          .login-left-panel {
            width: 100% !important;
            padding: 32px !important;
            min-height: auto !important;
          }
          .login-right-panel {
            width: 100% !important;
            padding: 24px 16px !important;
          }
        }
        @media (max-width: 480px) {
          .login-left-panel {
            padding: 24px !important;
          }
        }
      `}</style>
    </div>
  );
}