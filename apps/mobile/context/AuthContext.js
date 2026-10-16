// apps/mobile/context/AuthContext.js
//
// SentinelPH Citizen App — Auth state management (Email/Password via Firebase).
//
// FIX (multi-account report leak — CRITICAL): onAuthStateChanged now
// calls setActiveUser(uid) from db/sqlite.js whenever Firebase reports a
// signed-in user, and setActiveUser(null) when it reports none. This is
// what scopes every reports_outbox read/write to the currently-signed-in
// account, so a different Firebase user on the same phone never sees the
// previous account's local reports in Your Reports or Alerts.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../lib/api';
import NetInfo from '@react-native-community/netinfo';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';

import { auth } from '../config/firebase';
import { bootstrapCitizenRole } from '../lib/api';
import { setActiveUser } from '../db/sqlite';

const AuthContext = createContext(null);

const REMEMBER_ME_KEY = '@sentinelph_remember_me';

const GENERIC_AUTH_ERROR = 'Invalid email or password.';

function mapFirebaseAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/weak-password':
      return 'Please choose a stronger password (at least 8 characters, letters and numbers).';
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
  const [user, setUser] = useState(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState(null);
  const [rememberMe, setRememberMeState] = useState(true);

  const [currentScreen, setCurrentScreen] = useState('signin');
  const [emailForVerification, setEmailForVerification] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);

      if (firebaseUser) {
        setActiveUser(firebaseUser.uid);

        setEmailVerified(Boolean(firebaseUser.emailVerified));
        if (firebaseUser.emailVerified) {
          setEmailForVerification('');
        } else {
          setEmailForVerification(firebaseUser.email || '');
          setCurrentScreen('verify');
        }
      } else {
        setActiveUser(null);

        setEmailVerified(false);
        setEmailForVerification('');
        setCurrentScreen('signin');
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(REMEMBER_ME_KEY);
        if (stored !== null) {
          setRememberMeState(stored === 'true');
        }
      } catch (storageError) {
        console.warn('[AuthContext] Failed to read remember-me preference:', storageError);
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  const assertOnline = useCallback(() => {
    if (isOffline) {
      const message = 'You appear to be offline. Please reconnect and try again.';
      setError(message);
      throw new Error(message);
    }
  }, [isOffline]);

  const persistRememberMe = useCallback(async (value) => {
    try {
      await AsyncStorage.setItem(REMEMBER_ME_KEY, value ? 'true' : 'false');
      setRememberMeState(value);
    } catch (storageError) {
      console.warn('[AuthContext] Failed to persist remember-me preference:', storageError);
    }
  }, []);

  const switchScreen = useCallback((screenName) => {
    setError(null);
    setCurrentScreen(screenName);
  }, []);

  const signIn = useCallback(
    async (email, password, rememberMeArg = true) => {
      setError(null);
      setIsLoading(true);
      try {
        assertOnline();
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await persistRememberMe(rememberMeArg);
        return credential.user;
      } catch (signInError) {
        const message = signInError.code
          ? mapFirebaseAuthError(signInError.code)
          : signInError.message;
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [assertOnline, persistRememberMe]
  );

  const signUp = useCallback(
    async (fullName, email, password, agreedToTerms = true) => {
      setError(null);
      setIsLoading(true);
      try {
        assertOnline();

        if (!agreedToTerms) {
          const message =
            'You must agree to the Terms of Service and Privacy Policy to continue.';
          setError(message);
          throw new Error(message);
        }

        const credential = await createUserWithEmailAndPassword(auth, email, password);

        if (fullName) {
          await updateProfile(credential.user, { displayName: fullName });
        }

        try {
          await bootstrapCitizenRole();
          await credential.user.getIdToken(true);
        } catch (bootstrapErr) {
          console.warn(
            '[AuthContext.signUp] bootstrap-citizen failed (non-fatal):',
            bootstrapErr?.message
          );
        }

        await sendEmailVerification(credential.user);

        setEmailForVerification(email);
        setCurrentScreen('verify');
        setUser(credential.user);
        setEmailVerified(Boolean(credential.user.emailVerified));

        return credential.user;
      } catch (signUpError) {
        const message = signUpError.code
          ? mapFirebaseAuthError(signUpError.code)
          : signUpError.message;
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [assertOnline]
  );

  const requestPasswordOtp = useCallback(
    async (email) => {
      setError(null);
      setIsLoading(true);
      try {
        assertOnline();
        if (!email || !email.trim().includes('@')) {
          const message = 'Please enter a valid email address.';
          setError(message);
          throw new Error(message);
        }
        const response = await api.post('/api/v1/auth/request-password-otp', {
          email: email.trim().toLowerCase(),
        });
        return response.data;
      } catch (resetError) {
        const message =
          resetError?.response?.data?.message ||
          resetError.message ||
          'Could not send the reset code. Please try again.';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [assertOnline]
  );

  const verifyPasswordOtp = useCallback(
    async (email, otp) => {
      setError(null);
      setIsLoading(true);
      try {
        assertOnline();
        if (!otp || String(otp).trim().length < 4) {
          const message = 'Please enter the code from your email.';
          setError(message);
          throw new Error(message);
        }
        const response = await api.post('/api/v1/auth/verify-password-otp', {
          email: email.trim().toLowerCase(),
          otp: String(otp).trim(),
        });
        return response.data;
      } catch (verifyError) {
        const message =
          verifyError?.response?.data?.message ||
          verifyError.message ||
          'Could not verify the code. Please try again.';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [assertOnline]
  );

  const resetPasswordWithOtp = useCallback(
    async (resetSessionToken, newPassword) => {
      setError(null);
      setIsLoading(true);
      try {
        assertOnline();
        if (!resetSessionToken) {
          const message = 'Your reset session has expired. Please start again.';
          setError(message);
          throw new Error(message);
        }
        if (!newPassword || newPassword.length < 8) {
          const message =
            'Password must be at least 8 characters and include a letter and a number.';
          setError(message);
          throw new Error(message);
        }
        const response = await api.post('/api/v1/auth/reset-password-with-otp', {
          resetSessionToken,
          newPassword,
        });
        return response.data;
      } catch (resetError) {
        const message =
          resetError?.response?.data?.message ||
          resetError.message ||
          'Could not reset the password. Please start again.';
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [assertOnline]
  );

  const resendVerification = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      assertOnline();
      if (!auth.currentUser) {
        const message = 'No signed-in user to verify.';
        setError(message);
        throw new Error(message);
      }
      await sendEmailVerification(auth.currentUser);
    } catch (resendError) {
      const message = resendError.code
        ? mapFirebaseAuthError(resendError.code)
        : resendError.message;
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [assertOnline]);

  const checkVerificationStatus = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (!auth.currentUser) return false;
      await reload(auth.currentUser);

      const verifiedNow = Boolean(auth.currentUser.emailVerified);
      setUser(auth.currentUser);
      setEmailVerified(verifiedNow);

      if (verifiedNow) {
        setEmailForVerification('');
        return true;
      }
      const message = 'Still not verified. Check your inbox (and spam folder) for the link.';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setActiveUser(null);
    await firebaseSignOut(auth);
    setUser(null);
    setEmailVerified(false);
    setError(null);
    setEmailForVerification('');
    setCurrentScreen('signin');
  }, []);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  const value = {
    user,
    initializing,
    isLoading,
    isOffline,
    error,
    isAuthenticated: Boolean(user),
    isEmailVerified: emailVerified,
    rememberMe,
    currentScreen,
    emailForVerification,
    switchScreen,
    signIn,
    signUp,
    checkVerificationStatus,
    resendVerification,
    logout,
    getIdToken,
    requestPasswordOtp,
    verifyPasswordOtp,
    resetPasswordWithOtp,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called within an <AuthProvider>');
  }
  return ctx;
}