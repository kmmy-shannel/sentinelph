import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { fetchCurrentUserProfile } from '../lib/api';

const AuthContext = createContext(undefined);

export const ROLES = {
  OFFICER: 'officer',
  ANALYST: 'analyst',
  AUDITOR: 'auditor',
};

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null); // { role, displayName, email, ... } from backend
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadProfile = useCallback(async () => {
    try {
      const data = await fetchCurrentUserProfile();
      setProfile(data);
      return data;
    } catch (profileError) {
      console.error('Failed to load user profile from backend:', profileError);
      setProfile(null);
      setError('Unable to load your account details. Please try again.');
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setFirebaseUser(user);

      if (user) {
        await loadProfile();
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  const login = useCallback(
    async (email, password) => {
      setError(null);
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const loadedProfile = await loadProfile();
        return { user: credential.user, profile: loadedProfile };
      } catch (loginError) {
        const message = mapFirebaseAuthError(loginError.code);
        setError(message);
        throw new Error(message);
      }
    },
    [loadProfile]
  );

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
    setFirebaseUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (firebaseUser) {
      return loadProfile();
    }
    return null;
  }, [firebaseUser, loadProfile]);

  const value = useMemo(
    () => ({
      user: firebaseUser,
      profile,
      role: profile?.role || null,
      isAuthenticated: !!firebaseUser && !!profile,
      loading,
      error,
      login,
      logout,
      refreshProfile,
    }),
    [firebaseUser, profile, loading, error, login, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function mapFirebaseAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}