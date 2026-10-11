// apps/web/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import apiClient from '../lib/api';

export const ROLES = {
  OFFICER: 'officer',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

// 2-minute inactivity timeout
const INACTIVITY_MS = 5 * 60 * 1000;
const ACTIVITY_CHECK_INTERVAL_MS = 10 * 1000;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [role, setRole] = useState(null);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [loading, setLoading] = useState(true);

  // Controls whether the "logging out" overlay is visible. When it
  // flips to true, we render the overlay, wait for its fade, then sign out.
  const [loggingOut, setLoggingOut] = useState(false);

  const lastActivityRef = useRef(Date.now());

  // Session persistence — survives refresh, dies on tab close.
  useEffect(() => {
    setPersistence(auth, browserSessionPersistence).catch((err) => {
      console.error('[AuthContext] Failed to set persistence:', err);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const tokenResult = await fbUser.getIdTokenResult(true);
          setFirebaseUser(fbUser);
          setRole(tokenResult.claims.role || null);
          setJurisdiction(tokenResult.claims.jurisdiction || null);
        } catch (err) {
          console.error('[AuthContext] Failed to read token claims:', err);
          setFirebaseUser(null);
          setRole(null);
          setJurisdiction(null);
        }
      } else {
        setFirebaseUser(null);
        setRole(null);
        setJurisdiction(null);
        // If we were mid-logout, reset the flag once the sign-out completes.
        setLoggingOut(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Inactivity watchdog — fires the animated overlay, then signs out.
  useEffect(() => {
    if (!firebaseUser) return;

    const bump = () => { lastActivityRef.current = Date.now(); };

    const events = ['mousedown', 'keydown', 'scroll', 'mousemove', 'touchstart', 'focus'];
    events.forEach(evt => window.addEventListener(evt, bump, { passive: true }));

    lastActivityRef.current = Date.now();

    const intervalId = setInterval(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (idleFor >= INACTIVITY_MS) {
        console.log('[AuthContext] Inactivity timeout — showing logout overlay.');
        setLoggingOut(true);

        // Give the overlay ~2.2s to fade in and be read, then sign out.
        // signOut triggers onAuthStateChanged → firebaseUser = null →
        // ProtectedRoute redirects to /login.
        setTimeout(() => {
          signOut(auth).catch((err) => {
            console.error('[AuthContext] Sign-out on inactivity failed:', err);
          });
        }, 2200);
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, bump));
      clearInterval(intervalId);
    };
  }, [firebaseUser]);

  const logout = async () => {
    await signOut(auth);
  };

  const requestPasswordReset = useCallback(async (email) => {
    const response = await apiClient.post('/api/v1/auth/request-password-reset', { email });
    return response.data;
  }, []);

  const confirmPasswordReset = useCallback(async (token, newPassword) => {
    const response = await apiClient.post('/api/v1/auth/confirm-password-reset', { token, newPassword });
    return response.data;
  }, []);

  const value = {
    isAuthenticated: !!firebaseUser,
    user: firebaseUser
      ? { uid: firebaseUser.uid, email: firebaseUser.email, name: firebaseUser.displayName }
      : null,
    role,
    jurisdiction,
    loading,
    logout,
    requestPasswordReset,
    confirmPasswordReset,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {loggingOut && <InactivityOverlay />}
    </AuthContext.Provider>
  );
}

// ─── Inactivity overlay ──────────────────────────────────────────────
// Defined at module scope (not inside AuthProvider) so React never
// remounts it. Renders a full-screen blur with a spinner and a
// message, then the caller signs out after ~2.2s.
function InactivityOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(6, 6, 15, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.45s ease',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          transform: visible ? 'translateY(0)' : 'translateY(8px)',
          transition: 'transform 0.45s ease',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            margin: '0 auto 20px',
            borderRadius: '50%',
            border: '3px solid rgba(59,130,246,0.2)',
            borderTopColor: '#3b82f6',
            animation: 'inactivity-spin 0.9s linear infinite',
          }}
        />
        <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
          Logging out due to inactivity
        </div>
        <div
          style={{
            fontSize: '12px',
            color: '#64748b',
            fontFamily: "'JetBrains Mono',monospace",
            letterSpacing: '0.04em',
          }}
        >
          Please sign in again to continue
        </div>
      </div>
      <style>{`@keyframes inactivity-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}