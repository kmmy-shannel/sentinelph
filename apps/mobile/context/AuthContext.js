// apps/mobile/context/AuthContext.js
//
// Global auth state for the Citizen App. Wraps Firebase's phone/OTP flow
// using PhoneAuthProvider directly (not the higher-level
// signInWithPhoneNumber helper), paired with our own RecaptchaModal
// component (components/RecaptchaModal.js) instead of the unmaintained
// `expo-firebase-recaptcha` package:
//
//   sendOtp(fullPhoneNumber)
//     -> RecaptchaModal.verify() produces a token
//     -> PhoneAuthProvider(auth).verifyPhoneNumber(phone, verifier)
//     -> returns a verificationId (string), stored in state
//   confirmOtp(code)
//     -> PhoneAuthProvider.credential(verificationId, code)
//     -> signInWithCredential(auth, credential)
//
// Session persists via AsyncStorage (config/firebase.js) and is restored
// automatically on relaunch through onAuthStateChanged.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  PhoneAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import { auth, firebaseConfig } from '../config/firebase';
import RecaptchaModal from '../components/RecaptchaModal';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [verificationId, setVerificationId] = useState(null);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    // Restores the session from AsyncStorage on cold start, and keeps
    // `user` in sync with sign-in/sign-out from anywhere in the app.
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  /**
   * Kicks off phone verification. `fullPhoneNumber` must be E.164 format,
   * e.g. "+639171234567". Resolves once Firebase has sent the SMS; the
   * returned verificationId is stashed in state for confirmOtp() to pair
   * with the 6-digit code the user enters.
   */
  const sendOtp = useCallback(async (fullPhoneNumber) => {
    if (!recaptchaRef.current) {
      throw new Error('Verification is still starting up — try again in a moment.');
    }
    const phoneProvider = new PhoneAuthProvider(auth);
    const id = await phoneProvider.verifyPhoneNumber(fullPhoneNumber, recaptchaRef.current);
    setVerificationId(id);
    return id;
  }, []);

  /**
   * Confirms the 6-digit code against the pending sendOtp() session.
   * On success, onAuthStateChanged above fires and updates `user`.
   */
  const confirmOtp = useCallback(
    async (code) => {
      if (!verificationId) {
        throw new Error('No verification in progress — request a new code.');
      }
      const credential = PhoneAuthProvider.credential(verificationId, code);
      const result = await signInWithCredential(auth, credential);
      setVerificationId(null);
      return result.user;
    },
    [verificationId]
  );

  const resetOtpSession = useCallback(() => {
    setVerificationId(null);
  }, []);

  const logout = useCallback(async () => {
    await firebaseSignOut(auth);
    setVerificationId(null);
  }, []);

  /**
   * Convenience accessor so screens/services don't need to import Firebase
   * directly just to read a token — mirrors what lib/api.js does internally.
   */
  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  const value = {
    user,
    initializing,
    isAuthenticated: Boolean(user),
    sendOtp,
    confirmOtp,
    resetOtpSession,
    logout,
    getIdToken,
  };

  return (
    <AuthContext.Provider value={value}>
      <RecaptchaModal ref={recaptchaRef} firebaseConfig={firebaseConfig} />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called within an <AuthProvider>');
  }
  return ctx;
}