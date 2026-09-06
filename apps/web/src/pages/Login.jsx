// apps/web/src/pages/Login.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Shield, Loader2, Eye, EyeOff, ChevronDown, Check } from 'lucide-react';
import { useAuth, ROLES } from '../context/AuthContext';

const ROLE_OPTIONS = [
  {
    id: ROLES.OFFICER,
    label: 'Barangay / NBI Officer',
    dept: 'NBI Cybercrime Division',
    icon: '🛡️',
    color: '#3b82f6',
  },
  {
    id: ROLES.ANALYST,
    label: 'Fraud Analyst',
    dept: 'NTC Fraud Research Division',
    icon: '🔍',
    color: '#a855f7',
  },
  {
    id: ROLES.AUDITOR,
    label: 'System Auditor',
    dept: 'DICT Independent Auditor',
    icon: '⚖️',
    color: '#22c55e',
  },
];

function RoleDropdown({ value, onChange, placeholder = 'Select your assigned role…' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = ROLE_OPTIONS.find((r) => r.id === value);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative z-20">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-all"
        style={{
          background: '#080810',
          border: `1.5px solid ${open ? (selected?.color ?? '#6366f1') + '80' : '#1c1c2e'}`,
          color: selected ? '#e2e8f0' : '#4b5563',
          boxShadow: open ? `0 0 0 3px ${(selected?.color ?? '#6366f1')}14` : 'none',
        }}
      >
        {selected ? (
          <>
            <span className="text-base">{selected.icon}</span>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-white">{selected.label}</div>
              <div
                className="text-xs mt-0.5"
                style={{ color: selected.color, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {selected.dept}
              </div>
            </div>
          </>
        ) : (
          <span className="flex-1 text-left text-sm" style={{ color: '#4b5563' }}>
            {placeholder}
          </span>
        )}
        <ChevronDown
          size={14}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            flexShrink: 0,
            color: '#4b5563',
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden"
          style={{ background: '#0d0d1a', border: '1.5px solid #1c1c2e', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', zIndex: 50 }}
        >
          {ROLE_OPTIONS.map((role, i) => (
            <button
              key={role.id}
              type="button"
              onClick={() => {
                onChange(role.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all"
              style={{
                borderBottom: i < ROLE_OPTIONS.length - 1 ? '1px solid #13131e' : 'none',
                background: value === role.id ? role.color + '12' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (value !== role.id) e.currentTarget.style.background = '#13131e';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = value === role.id ? role.color + '12' : 'transparent';
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                style={{ background: role.color + '18' }}
              >
                {role.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white">{role.label}</div>
                <div
                  className="text-xs mt-0.5 truncate"
                  style={{ color: role.color, fontFamily: "'JetBrains Mono', monospace", opacity: 0.85 }}
                >
                  {role.dept}
                </div>
              </div>
              {value === role.id && <Check size={14} color={role.color} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Login() {
  const { login, register, isAuthenticated, role, loading: authLoading } = useAuth();

  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'

  // Shared
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);

  // Sign-in only
  const [rememberMe, setRememberMe] = useState(false);
  const [signinRoleHint, setSigninRoleHint] = useState(''); // cosmetic only, see note above

  // Sign-up only
  const [fullName, setFullName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestedRole, setRequestedRole] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const selectedHint = ROLE_OPTIONS.find((r) => r.id === signinRoleHint);

  if (!authLoading && isAuthenticated) {
    const dest =
      role === ROLES.OFFICER
        ? '/officer'
        : role === ROLES.ANALYST
        ? '/analyst'
        : role === ROLES.AUDITOR
        ? '/auditor'
        : '/unauthorized';
    return <Navigate to={dest} replace />;
  }

  const resetMessages = () => {
    setFormError(null);
    setInfoMessage(null);
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      // Note: signinRoleHint is a cosmetic department badge only.
      // Actual role/permissions come from the backend profile via
      // AuthContext after Firebase verifies the credentials.
      await login(email, password, { rememberMe });
    } catch (err) {
      setFormError(err.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    resetMessages();

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!requestedRole) {
      setFormError('Please select the role you are requesting access for.');
      return;
    }

    setSubmitting(true);
    try {
      await register({ fullName, email, password, agreedToTerms });
      setInfoMessage(
        'Account created. Check your email to verify your address — an administrator still needs to approve your requested role before you can sign in.'
      );
      setTab('signin');
    } catch (err) {
      setFormError(err.message || 'Unable to create account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full bg-[#080810] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-accent transition-all';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-canvas px-4 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-card border border-white/10 flex items-center justify-center mb-4">
            <Shield size={26} className="text-accent" />
          </div>
          <h1 className="text-xl font-bold text-white">SentinelPH Console</h1>
          <p
            className="text-slate-500 text-xs mt-1 tracking-wide"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Republic of the Philippines · Verified Access Only
          </p>
        </div>

        <div className="bg-card border border-white/10 rounded-2xl p-6 shadow-xl shadow-black/40">
          {/* Tabs */}
          <div
            className="flex rounded-xl p-1 mb-5"
            style={{ background: '#080810', border: '1px solid #1c1c2e' }}
          >
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                resetMessages();
              }}
              className="flex-1 text-sm font-medium py-2 rounded-lg transition-all"
              style={
                tab === 'signin'
                  ? { background: '#6366f1', color: 'white' }
                  : { color: '#64748b' }
              }
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                resetMessages();
              }}
              className="flex-1 text-sm font-medium py-2 rounded-lg transition-all"
              style={
                tab === 'signup'
                  ? { background: '#6366f1', color: 'white' }
                  : { color: '#64748b' }
              }
            >
              Request Access
            </button>
          </div>

          {formError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
              {formError}
            </div>
          )}
          {infoMessage && (
            <div className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 mb-4">
              {infoMessage}
            </div>
          )}

          {tab === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@sentinelph.gov.ph"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass + ' pr-10'}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Department badge (optional)
                </label>
                <RoleDropdown
                  value={signinRoleHint}
                  onChange={setSigninRoleHint}
                  placeholder="Show your department badge…"
                />
                {selectedHint && (
                  <p className="text-[11px] text-slate-600 mt-1.5">
                    Cosmetic only — your actual access level is verified from your account after sign-in.
                  </p>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-white/20 bg-[#080810] text-accent focus:ring-accent focus:ring-offset-0"
                />
                Remember me on this device
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Full name</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="Juan Dela Cruz"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Government email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@sentinelph.gov.ph"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Requested role
                </label>
                <RoleDropdown value={requestedRole} onChange={setRequestedRole} />
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Subject to admin approval before permissions take effect.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Confirm password
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Re-enter password"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-400 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-[#080810] text-accent focus:ring-accent focus:ring-offset-0"
                />
                <span>I agree to the Terms of Service and Privacy Policy.</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Request access'
                )}
              </button>
            </form>
          )}
        </div>

        <p
          className="text-center text-[11px] text-slate-600 mt-6 tracking-wide"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          SentinelPH · NBI · NTC · DICT — Officer / Analyst / Auditor Console
        </p>
      </div>
    </div>
  );
}