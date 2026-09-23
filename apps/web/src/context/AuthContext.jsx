// apps/web/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import apiClient from '../lib/api';

export const ROLES = {
  OFFICER: 'officer',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [role, setRole] = useState(null);
  const [jurisdiction, setJurisdiction] = useState(null);
  const [loading, setLoading] = useState(true);

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
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  // ─── Password Reset ────────────────────────────────────────────────
  // Reverted: returns the raw response body without throwing, so the
  // caller always sees a successful result (matches original behavior).
  const requestPasswordReset = useCallback(async (email) => {
    const response = await apiClient.post('/api/v1/auth/request-password-reset', {
      email,
    });
    return response.data;
  }, []);

  const confirmPasswordReset = useCallback(async (token, newPassword) => {
    const response = await apiClient.post('/api/v1/auth/confirm-password-reset', {
      token,
      newPassword,
    });
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}