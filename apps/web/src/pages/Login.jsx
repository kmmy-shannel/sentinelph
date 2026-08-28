import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, isAuthenticated, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const redirectForRole = (userRole) => {
    switch (userRole) {
      case 'officer':
        return '/officer';
      case 'analyst':
        return '/analyst';
      case 'auditor':
        return '/auditor';
      default:
        return '/login';
    }
  };

  if (isAuthenticated) {
    const from = location.state?.from?.pathname;
    navigate(from || redirectForRole(role), { replace: true });
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const { profile } = await login(email.trim(), password);
      const destination = location.state?.from?.pathname || redirectForRole(profile?.role);
      navigate(destination, { replace: true });
    } catch (error) {
      setFormError(error.message || 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mb-4">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">SentinelPH</h1>
          <p className="text-slate-400 text-sm mt-1">Internal Operations Console</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">
                Email
              </label>
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-3.5 focus-within:ring-2 focus-within:ring-blue-500">
                <Mail size={16} className="text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@sentinelph.gov.ph"
                  autoComplete="username"
                  className="flex-1 bg-transparent py-3 ml-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase mb-1.5 block">
                Password
              </label>
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-xl px-3.5 focus-within:ring-2 focus-within:ring-blue-500">
                <Lock size={16} className="text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="flex-1 bg-transparent py-3 ml-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3.5 py-2.5 text-sm text-red-400">
                <AlertCircle size={15} />
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-3.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Access restricted to authorized officers, analysts, and auditors.
        </p>
      </div>
    </div>
  );
}