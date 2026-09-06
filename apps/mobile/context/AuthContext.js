// apps/mobile/context/AuthContext.js
//
// SentinelPH Citizen App — Auth state management (Email/Password via Firebase).
//
// Firebase Email/Password auth (firebase/auth v10+). Enable the
// Email/Password provider for this project in the Firebase console
// before testing.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const AuthContext = createContext(null);

const REMEMBER_ME_KEY = '@sentinelph_remember_me';

// Deliberately generic — never reveals whether a given email address
// already has an account, or whether an email vs. password was wrong.
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
    // Collapsed into ONE generic message — do not let a client
    // distinguish these cases from one another (user-enumeration defense).
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
  const [initializing, setInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState(null);
  const [rememberMe, setRememberMeState] = useState(true);

  const [currentScreen, setCurrentScreen] = useState('signin'); // "signin" | "signup" | "verify"
  const [emailForVerification, setEmailForVerification] = useState('');

  // Restores the session on cold start and keeps `user` (including
  // emailVerified) in sync with sign-in/sign-out from anywhere in the app.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  // Loads the persisted "remember me" preference once at startup.
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

  // Tracks connectivity so screens can show an offline banner rather than
  // let an auth call fail with a confusing network error mid-flow.
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
        await sendEmailVerification(credential.user);
        setUser(credential.user);
        setEmailForVerification(email);
        setCurrentScreen('verify');
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

  // Verification happens via a link the citizen opens outside the app, so
  // we need an explicit way to re-pull the emailVerified flag once they
  // return — Firebase's local user object is not pushed updates for this.
  const checkVerificationStatus = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (!auth.currentUser) return false;
      await reload(auth.currentUser);
      // reload() mutates auth.currentUser in place, but it's not the same
      // object reference React had — force a state update so consumers
      // re-render with the fresh emailVerified flag.
      setUser({ ...auth.currentUser });
      if (auth.currentUser.emailVerified) {
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
    await firebaseSignOut(auth);
    setUser(null);
    setError(null);
    setEmailForVerification('');
    setCurrentScreen('signin');
  }, []);

  // Convenience accessor so screens/services don't need to import Firebase
  // directly just to read a token.
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
    isEmailVerified: Boolean(user?.emailVerified),
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