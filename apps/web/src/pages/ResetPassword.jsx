// apps/web/src/pages/ResetPassword.jsx
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ACCENT = '#6366f1';

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '#1c1c2e' };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'WEAK', color: '#ef4444' };
  if (score <= 2) return { score, label: 'MEDIUM', color: '#f59e0b' };
  if (score <= 3) return { score, label: 'STRONG', color: '#22c55e' };
  return { score, label: 'VERY STRONG', color: '#22c55e' };
}

function isPasswordValid(pw) {
  if (typeof pw !== 'string') return false;
  if (pw.length < 8) return false;
  return /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { confirmPasswordReset } = useAuth();

  const token = searchParams.get('token') || '';

  // Which flow brought the user here?
  //   mode=activate  → officer invitation (heading: "Set Your Password")
  //   (anything else) → forgot-password reset (heading: "Set a New Password")
  const mode = searchParams.get('mode') || '';
  const isActivate = mode === 'activate';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    token &&
    isPasswordValid(newPassword) &&
    passwordsMatch &&
    confirmPassword.length > 0 &&
    !loading;

  // No token → invalid link page
  useEffect(() => {
    if (!token) {
      setError('This reset link is invalid. Please request a new one.');
    }
  }, [token]);

  // Headings driven by the flow
  const heading = isActivate ? 'Set Your Password' : 'Set a New Password';
  const subtitle = isActivate
    ? 'Welcome to SentinelPH. Choose a strong password to activate your officer account.'
    : "Choose a strong password you haven't used before.";
  const successHeading = isActivate
    ? 'Account activated'
    : 'Password updated';
  const successBody = isActivate
    ? 'Your officer account is ready. Redirecting you to sign in…'
    : 'Redirecting you to sign in…';

  const inputStyle = (name, isError = false) => ({
    width: '100%',
    padding: '14px 18px',
    paddingRight: '48px',
    borderRadius: '12px',
    fontSize: '14px',
    background: '#080810',
    border: `1.5px solid ${
      isError ? '#ef444480' : focusField === name ? ACCENT + '80' : '#1c1c2e'
    }`,
    color: '#e2e8f0',
    outline: 'none',
    boxShadow: focusField === name ? `0 0 0 3px ${ACCENT}14` : 'none',
    transition: 'all 0.3s',
    boxSizing: 'border-box',
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    try {
      await confirmPasswordReset(token, newPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login?reset=success', { replace: true });
      }, 2200);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Could not reset the password. Please request a new link.';
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        background: '#06060f',
        fontFamily: "'Inter',sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'linear-gradient(rgba(15,15,30,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(15,15,30,0.9) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          filter: 'blur(120px)',
          background: ACCENT + '20',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            borderRadius: '20px',
            padding: '40px',
            position: 'relative',
            background: '#0b0b16',
            border: '1px solid #16162a',
            boxShadow: '0 40px 80px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              borderRadius: '20px 20px 0 0',
              background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`,
            }}
          />

          <div style={{ marginBottom: '28px', textAlign: 'center' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '22px',
                color: '#fff',
                background: 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                boxShadow: '0 0 20px #4f46e540',
                margin: '0 auto 16px',
              }}
            >
              S
            </div>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#fff',
                marginBottom: '6px',
                letterSpacing: '-0.02em',
              }}
            >
              {heading}
            </h2>
            <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.6 }}>
              {subtitle}
            </p>
          </div>

          {success ? (
            <div
              style={{
                padding: '20px',
                borderRadius: '12px',
                background: '#0a1a12',
                border: '1px solid #22c55e40',
                color: '#22c55e',
                textAlign: 'center',
              }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#22c55e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginBottom: '10px' }}
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                {successHeading}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.85 }}>{successBody}</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: '#ef444420',
                    border: '1px solid #ef444430',
                    color: '#ef4444',
                    fontSize: '13px',
                    marginBottom: '18px',
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ marginBottom: '18px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    marginBottom: '8px',
                    fontWeight: 500,
                    color: '#6b7280',
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: '0.06em',
                  }}
                >
                  NEW PASSWORD
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters, letter + number"
                    onFocus={() => setFocusField('new')}
                    onBlur={() => setFocusField(null)}
                    autoComplete="new-password"
                    disabled={loading}
                    style={inputStyle('new')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                    }}
                  >
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

                {newPassword && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: '3px',
                            borderRadius: '2px',
                            background:
                              i < strength.score ? strength.color : '#1c1c2e',
                            transition: 'background 0.3s',
                          }}
                        />
                      ))}
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '1px',
                        color: strength.color,
                      }}
                    >
                      {strength.label}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '18px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    marginBottom: '8px',
                    fontWeight: 500,
                    color: '#6b7280',
                    fontFamily: "'JetBrains Mono',monospace",
                    letterSpacing: '0.06em',
                  }}
                >
                  CONFIRM PASSWORD
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    onFocus={() => setFocusField('confirm')}
                    onBlur={() => setFocusField(null)}
                    autoComplete="new-password"
                    disabled={loading}
                    style={inputStyle(
                      'confirm',
                      confirmPassword.length > 0 && !passwordsMatch
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                    }}
                  >
                    {showConfirm ? (
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
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#ef4444',
                      marginTop: '6px',
                      fontFamily: "'JetBrains Mono',monospace",
                    }}
                  >
                    Passwords do not match
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 700,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  marginTop: '24px',
                  background: canSubmit
                    ? `linear-gradient(135deg,${ACCENT},${ACCENT}cc)`
                    : '#111118',
                  color: canSubmit ? '#fff' : '#374151',
                  boxShadow: canSubmit ? `0 0 30px ${ACCENT}35` : 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s',
                }}
              >
                {loading && (
                  <span
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      animation: 'spin 0.7s linear infinite',
                      display: 'inline-block',
                    }}
                  />
                )}
                {loading
                  ? isActivate
                    ? 'Activating…'
                    : 'Updating password…'
                  : isActivate
                  ? 'Activate Account'
                  : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: '11px',
            marginTop: '16px',
            color: '#1f2937',
          }}
        >
          Protected under RA 10175 · Philippine Cybercrime Prevention Act
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}