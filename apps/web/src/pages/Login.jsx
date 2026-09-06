// apps/web/src/context/AuthContext.jsx
//
// Auth state for the Officer/Analyst/Auditor web console — Email/Password
// via Firebase Auth. This surface was already email-based (officers don't
// have SMS-verifiable numbers on file), so this revision adds:
//   - explicit persistence control (browserLocalPersistence for
//     "remember me", browserSessionPersistence otherwise)
//   - a register() path with mandatory ToS/privacy consent and
//     email verification, for the rare self-service account case
//   - fully generic, non-enumerating credential error copy

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
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

// Never reveals whether a given email address already has an account —
// every credential-related failure on both login and registration maps
// to this single generic message.
const GENERIC_AUTH_ERROR = 'Invalid credentials or account issue. Please try again.';

function mapFirebaseAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 6 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your connection and try again.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/email-already-in-use':
    case 'auth/user-disabled':
      return GENERIC_AUTH_ERROR;
    default:
      return GENERIC_AUTH_ERROR;
  }
}

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

  /**
   * @param {string} email
   * @param {string} password
   * @param {{ rememberMe?: boolean }} [options] rememberMe=true keeps the
   *   session across browser restarts (browserLocalPersistence); false
   *   (the default) clears it when the tab/browser closes.
   */
  const login = useCallback(
    async (email, password, options = {}) => {
      setError(null);
      try {
        await setPersistence(
          auth,
          options.rememberMe ? browserLocalPersistence : browserSessionPersistence
        );
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

  /**
   * Self-service registration for staff accounts. Requires explicit ToS +
   * privacy consent and sends a verification email; the backend profile
   * (and role assignment) is still provisioned server-side per the
   * existing onboarding process, so `profile` may be null until an admin
   * completes that step.
   */
  const register = useCallback(
    async ({ fullName, email, password, agreedToTerms }) => {
      setError(null);

      if (!agreedToTerms) {
        const message = 'You must agree to the Terms of Service and Privacy Policy to continue.';
        setError(message);
        throw new Error(message);
      }

      try {
        await setPersistence(auth, browserSessionPersistence);
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        if (fullName) {
          await updateProfile(credential.user, { displayName: fullName });
        }
        await sendEmailVerification(credential.user);
        setFirebaseUser(credential.user);
        return credential.user;
      } catch (registerError) {
        const message = mapFirebaseAuthError(registerError.code);
        setError(message);
        throw new Error(message);
      }
    },
    []
  );

  const resendVerificationEmail = useCallback(async () => {
    setError(null);
    if (!auth.currentUser) {
      const message = 'No signed-in user to verify.';
      setError(message);
      throw new Error(message);
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (resendError) {
      const message = mapFirebaseAuthError(resendError.code);
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Verification happens via a link opened outside the SPA (usually a new
  // tab), so we need an explicit re-pull of emailVerified once the staff
  // member returns.
  const reloadUser = useCallback(async () => {
    if (!auth.currentUser) return null;
    await reload(auth.currentUser);
    setFirebaseUser(auth.currentUser);
    return auth.currentUser;
  }, []);

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
      isEmailVerified: Boolean(firebaseUser?.emailVerified),
      loading,
      error,
      login,
      register,
      logout,
      resendVerificationEmail,
      reloadUser,
      refreshProfile,
    }),
    [
      firebaseUser,
      profile,
      loading,
      error,
      login,
      register,
      logout,
      resendVerificationEmail,
      reloadUser,
      refreshProfile,
    ]
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