// apps/web/src/pages/Login.jsx
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";
import apiClient from "../lib/api";

const ROLE_COLOR = {
  officer: "#3b82f6",
  admin: "#a855f7",
  superadmin: "#22c55e",
  citizen: "#6b7280",
};

const ROLE_REDIRECT = {
  officer: "/officer/dashboard",
  admin: "/admin/dashboard",
  superadmin: "/superadmin/dashboard",
  citizen: "/citizen/dashboard",
};

const DEFAULT_ACCENT = "#6366f1";

export default function Login() {
  const { isAuthenticated, role: authRole, loading: authLoading, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [error, setError] = useState(null);

  const [detectedRole, setDetectedRole] = useState(null);
  const accent = detectedRole ? (ROLE_COLOR[detectedRole] || DEFAULT_ACCENT) : DEFAULT_ACCENT;

  const [blockedAccount, setBlockedAccount] = useState(null);

  const [stats, setStats] = useState({ reportsFiled: 0, casesClosed: 0, uptime: 99.97, version: "2.4.1" });

  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const canSubmit = email && password && !loading;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiClient.get("/api/v1/stats/public")
        .then((res) => {
          if (!cancelled && res.data?.data) setStats(res.data.data);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated && authRole) {
      const path = ROLE_REDIRECT[authRole] || '/unauthorized';
      window.location.href = path;
    }
  }, [authLoading, isAuthenticated, authRole]);

  const sanitizePw = (value) => value.replace(/\s/g, "");

  const inputStyle = (name) => ({
    width: "100%", padding: "18px 22px", borderRadius: "14px", fontSize: "16px",
    background: "#080810",
    border: `1.5px solid ${focusField === name ? accent + "80" : "#1c1c2e"}`,
    color: "#e2e8f0", outline: "none",
    boxShadow: focusField === name ? `0 0 0 4px ${accent}14` : "none",
    transition: "all 0.3s", boxSizing: "border-box",
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);

    try {
      const check = await apiClient.post('/api/v1/auth/check-email', {
        email: email.trim().toLowerCase(),
      });

      if (!check.data?.exists) {
        setError(
          check.data?.message ||
          "This email isn't registered in SentinelPH. Contact your administrator."
        );
        setLoading(false);
        return;
      }

      if (check.data?.status === 'disabled') {
        setBlockedAccount({
          status: 'disabled',
          reason: check.data?.suspendReason || null,
          message: 'Your account has been disabled. Contact your NBI supervisor to restore access.',
        });
        setLoading(false);
        return;
      }

      if (check.data?.status === 'suspended') {
        setBlockedAccount({
          status: 'suspended',
          until: check.data?.suspendedUntil || null,
          reason: check.data?.suspendReason || null,
        });
        setLoading(false);
        return;
      }

      if (check.data?.role) {
        setDetectedRole(check.data.role);
        await new Promise(r => setTimeout(r, 350));
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await cred.user.getIdTokenResult(true);
      const actualRole = tokenResult.claims.role;

      if (!actualRole) {
        await auth.signOut();
        setDetectedRole(null);
        setError('Your account has no assigned role. Contact your system administrator.');
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error('[Login] sign-in failed:', err);
      setDetectedRole(null);
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
        transition: "background 0.6s ease"
      }} />

      <div style={{
        position: "absolute", width: "350px", height: "350px", borderRadius: "50%",
        filter: "blur(100px)", pointerEvents: "none", zIndex: 0,
        background: "#3730a318",
        animation: "floatGlow2 15s infinite ease-in-out"
      }} />

      {/* ── LEFT PANEL ── */}
      <div className="login-left-panel" style={{ width: "46%", flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "56px 64px", position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <img
            src="/logo.png"
            alt="SentinelPH"
            style={{ width: "56px", height: "56px", objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "20px", letterSpacing: "-0.01em" }}>SentinelPH</div>
            <div style={{ fontSize: "11px", color: "#4b5563", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.1em", marginTop: "2px" }}>WEB CONTROL CENTER</div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ maxWidth: "600px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "9px", padding: "7px 14px", borderRadius: "999px", marginBottom: "26px", fontSize: "12px", fontWeight: 500, letterSpacing: "0.08em", fontFamily: "'JetBrains Mono',monospace", background: accent + "15", border: `1px solid ${accent}30`, color: accent, transition: "all 0.6s ease" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: accent, display: "inline-block", transition: "background 0.6s ease" }} />
            AUTHORIZED PERSONNEL ONLY
          </div>
          <h1 style={{ fontWeight: 800, color: "#fff", lineHeight: 1.08, marginBottom: "22px", fontSize: "clamp(38px,3.4vw,58px)", letterSpacing: "-0.03em" }}>
            Integrated Scam<br />Detection &<br />
            <span style={{ color: accent, transition: "color 0.6s ease" }}>Reporting Platform</span>
          </h1>
          <p style={{ fontSize: "17px", lineHeight: 1.7, color: "#4b5563", marginBottom: "40px" }}>
            Access is scoped to your jurisdiction and permissions. All sessions are cryptographically logged and tamper-evident.
          </p>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", padding: "26px", borderRadius: "16px", background: "#0d0d18", border: "1px solid #13131e" }}>
            {[
              { v: (stats.reportsFiled ?? 0).toLocaleString(), l: "Reports Filed" },
              { v: (stats.casesClosed ?? 0).toLocaleString(), l: "Cases Closed" },
              { v: `${(stats.uptime ?? 99.97).toFixed(2)}%`, l: "Uptime" },
            ].map((s) => (
              <div key={s.l} style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 800, color: "#fff", fontSize: "24px", fontFamily: "'JetBrains Mono',monospace" }}>{s.v}</div>
                <div style={{ fontSize: "13px", marginTop: "5px", color: "#374151" }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ fontSize: "12px", color: "#374151", fontFamily: "'JetBrains Mono',monospace" }}>System Operational · v{stats.version}</span>
          </div>
          <p style={{ fontSize: "12px", color: "#1f2937", lineHeight: 1.6 }}>
            Unauthorized access is a criminal offense under RA 10175<br />
            Philippine Cybercrime Prevention Act
          </p>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="login-right-panel" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", position: "relative", zIndex: 1, minWidth: 0 }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <div style={{ borderRadius: "22px", padding: "44px", position: "relative", background: "#0b0b16", border: "1px solid #16162a", boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "22px 22px 0 0", background: `linear-gradient(90deg,transparent,${accent},transparent)`, transition: "background 0.6s ease" }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              {/* Big logo above Sign In */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
                <img
                  src="/logo.png"
                  alt="SentinelPH"
                  style={{ width: "72px", height: "72px", objectFit: "contain" }}
                />
              </div>

              <div style={{ marginBottom: "30px", textAlign: "center" }}>
                <h2 style={{ fontSize: "28px", fontWeight: 800, color: "#fff", marginBottom: "8px", letterSpacing: "-0.02em" }}>Sign In</h2>
                <p style={{ fontSize: "15px", color: "#4b5563" }}>Enter your credentials to continue.</p>
              </div>

              {error && (
                <div style={{
                  padding: "14px 18px",
                  borderRadius: "12px",
                  background: "#ef444420",
                  border: "1px solid #ef444430",
                  color: "#ef4444",
                  fontSize: "14px",
                  lineHeight: 1.6,
                  marginBottom: "20px"
                }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "22px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "9px", fontWeight: 600, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>EMAIL ADDRESS</div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.trim())}
                    placeholder="you@sentinelph.gov.ph"
                    onFocus={() => setFocusField("email")}
                    onBlur={() => setFocusField(null)}
                    autoComplete="username"
                    style={inputStyle("email")}
                  />
                </div>

                <div style={{ marginBottom: "6px" }}>
                  <div style={{ fontSize: "12px", marginBottom: "9px", fontWeight: 600, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>PASSWORD</div>
                  <div style={{ position: "relative" }}>
                    <input
                      type={showPass ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(sanitizePw(e.target.value))}
                      placeholder="Enter your password"
                      onFocus={() => setFocusField("password")}
                      onBlur={() => setFocusField(null)}
                      autoComplete="new-password"
                      style={{ ...inputStyle("password"), paddingRight: "56px" }}
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position: "absolute", right: "18px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                      {showPass ? (
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#6b7280" strokeWidth="1.2" />
                          <circle cx="8" cy="8" r="2" stroke="#6b7280" strokeWidth="1.2" />
                          <line x1="2" y1="14" x2="14" y2="2" stroke="#6b7280" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                          <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="#6b7280" strokeWidth="1.2" />
                          <circle cx="8" cy="8" r="2" stroke="#6b7280" strokeWidth="1.2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: "right", marginBottom: "26px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForgotPw(true);
                      setForgotEmail("");
                      setForgotError(null);
                      setForgotSuccess(false);
                      setForgotLoading(false);
                    }}
                    style={{ fontSize: "13px", fontWeight: 600, color: accent, background: "none", border: "none", cursor: "pointer", transition: "color 0.6s ease" }}
                  >
                    Forgot password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    width: "100%", padding: "17px", borderRadius: "14px", fontSize: "16px", fontWeight: 700, border: "none",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                    background: canSubmit ? `linear-gradient(135deg,${accent},${accent}cc)` : "#111118",
                    color: canSubmit ? "#fff" : "#374151",
                    boxShadow: canSubmit ? `0 0 30px ${accent}35` : "none",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    transition: "all 0.6s ease",
                  }}
                >
                  {loading && <span style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block", flexShrink: 0 }} />}
                  {loading ? "Authenticating…" : "Sign In"}
                </button>
              </form>

              <p style={{ textAlign: "center", fontSize: "14px", marginTop: "26px", color: "#374151" }}>
                No account? <span style={{ color: "#4b5563" }}>Contact your administrator.</span>
              </p>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: "12px", marginTop: "18px", color: "#1f2937" }}>
            Protected under RA 10175 · Philippine Cybercrime Prevention Act
          </p>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotPw && (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div style={{ width: "100%", maxWidth: "460px", margin: "0 16px", borderRadius: "20px", padding: "36px", position: "relative", background: "#0e0e18", border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "1px", borderRadius: "20px 20px 0 0", background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />

            <button
              onClick={() => setShowForgotPw(false)}
              style={{ position: "absolute", top: "18px", right: "18px", color: "#4b5563", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>
                Reset Password
              </div>
              <div style={{ fontSize: "14px", color: "#4b5563", lineHeight: 1.6 }}>
                {forgotSuccess
                  ? `If an account exists for ${forgotEmail}, we've sent a reset link.`
                  : "Enter your registered email. We'll send you a secure link."}
              </div>
            </div>

            {forgotSuccess ? (
              <div style={{ padding: "18px", borderRadius: "14px", background: "#0a1a12", border: "1px solid #22c55e40", color: "#22c55e", textAlign: "center" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: "10px" }}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <div style={{ fontSize: "15px", fontWeight: 600, marginBottom: "4px" }}>Check your inbox</div>
                <div style={{ fontSize: "13px", opacity: 0.85, lineHeight: 1.5 }}>
                  The link expires in 15 minutes.
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", marginBottom: "9px", fontFamily: "'JetBrains Mono',monospace", letterSpacing: "0.06em" }}>EMAIL ADDRESS</div>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@sentinelph.gov.ph"
                    autoFocus
                    disabled={forgotLoading}
                    style={{
                      width: "100%", padding: "16px 18px", borderRadius: "13px", fontSize: "15px",
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
                  <div style={{ marginBottom: "16px", padding: "12px 14px", borderRadius: "10px", fontSize: "13px", background: "#ef444420", border: "1px solid #ef444430", color: "#ef4444" }}>
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
                      setForgotSuccess(true);
                    } finally {
                      setForgotLoading(false);
                    }
                  }}
                  style={{
                    width: "100%", padding: "16px", borderRadius: "13px", fontSize: "15px",
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

      {/* BLOCKED ACCOUNT MODAL */}
      {blockedAccount && (
        <div
          style={{
            position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          }}
          onClick={() => setBlockedAccount(null)}
        >
          <div
            style={{
              width: "100%", maxWidth: "460px", margin: "0 16px", borderRadius: "20px",
              padding: "36px", position: "relative", background: "#0e0e18",
              border: "1px solid #1a1a2a", boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "1px",
                borderRadius: "20px 20px 0 0",
                background: `linear-gradient(90deg,transparent,${blockedAccount.status === 'disabled' ? '#ef4444' : '#f59e0b'},transparent)`,
              }}
            />

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
              <div
                style={{
                  width: "70px", height: "70px", borderRadius: "50%",
                  background: blockedAccount.status === 'disabled' ? "#ef444415" : "#f59e0b15",
                  border: `1px solid ${blockedAccount.status === 'disabled' ? '#ef444440' : '#f59e0b40'}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {blockedAccount.status === 'disabled' ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
              </div>
            </div>

            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "21px", fontWeight: 800, color: "#fff", marginBottom: "8px" }}>
                {blockedAccount.status === 'disabled' ? 'Account Disabled' : 'Account Suspended'}
              </div>

              {blockedAccount.status === 'disabled' ? (
                <div style={{ fontSize: "14px", color: "#9ca3af", lineHeight: 1.7 }}>
                  {blockedAccount.message || 'Your account has been disabled. Contact your NBI supervisor.'}
                </div>
              ) : (
                <div style={{ fontSize: "14px", color: "#9ca3af", lineHeight: 1.7 }}>
                  Your account is temporarily suspended
                  {blockedAccount.until
                    ? <> until <strong style={{ color: "#f59e0b" }}>{new Date(blockedAccount.until).toLocaleString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}</strong>.</>
                    : '.'}
                </div>
              )}
            </div>

            {blockedAccount.reason && (
              <div style={{ padding: "14px 16px", borderRadius: "12px", marginBottom: "16px", background: "#1a0f06", border: "1px solid #f59e0b30" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", color: "#f59e0b", fontFamily: "'JetBrains Mono',monospace", marginBottom: "6px" }}>
                  REASON FROM ADMINISTRATOR
                </div>
                <div style={{ fontSize: "14px", color: "#fcd34d", lineHeight: 1.6, fontStyle: "italic" }}>
                  "{blockedAccount.reason}"
                </div>
              </div>
            )}

            <div style={{ padding: "13px 15px", borderRadius: "12px", background: "#080810", border: "1px solid #13131e", marginBottom: "20px" }}>
              <div style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.6 }}>
                Contact your <strong style={{ color: "#9ca3af" }}>NBI supervisor</strong> if you believe this is an error.
              </div>
            </div>

            <button
              onClick={() => setBlockedAccount(null)}
              style={{
                width: "100%", padding: "15px", borderRadius: "13px",
                fontSize: "15px", fontWeight: 700, border: "none",
                background: blockedAccount.status === 'disabled' ? "#ef4444" : "#f59e0b",
                color: blockedAccount.status === 'disabled' ? "#fff" : "#0a0a12",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
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
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #080810 inset !important;
          -webkit-text-fill-color: #e2e8f0 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
        @media (max-width: 1024px) {
          .login-container { flex-direction: column !important; overflow-y: auto !important; }
          .login-left-panel { width: 100% !important; padding: 32px !important; min-height: auto !important; }
          .login-right-panel { width: 100% !important; padding: 24px 16px !important; }
        }
        @media (max-width: 480px) {
          .login-left-panel { padding: 24px !important; }
        }
      `}</style>
    </div>
  );
}