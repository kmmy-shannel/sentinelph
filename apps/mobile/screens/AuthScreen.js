// apps/mobile/screens/AuthScreen.js
//
// SentinelPH Citizen App — Email/Password authentication screen.
// Three views: Sign In, Sign Up, and post-registration Email Verification.
//
// Design system: Dark canvas (#06060f), dark card (#0b0b16), dark inputs
// (#080810), indigo/purple accent (#6366f1 / #4f46e5), monospace uppercase
// field labels — matching the Figma Make "CITIZEN PROTECTION PORTAL" theme.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,  Image,   
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// T — Design tokens
// ---------------------------------------------------------------------------
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const T = {
  canvas: '#06060f',
  card: '#0b0b16',
  inputBg: '#080810',
  borderSubtle: '#16162a',
  borderMedium: '#1c1c2e',
  borderHighlight: '#2d2d48',
  indigo: '#6366f1',
  indigoDark: '#4f46e5',
  green: '#22c55e',
  red: '#ef4444',
  textPrimary: '#ffffff',
  textBody: '#e2e8f0',
  textMuted: '#6b7280',
  textDim: '#374151',
  weak: '#ef4444',
  medium: '#f59e0b',
  strong: '#22c55e',
  mono: MONO,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPasswordValid(password) {
  if (password.length < 8) return false;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

function getPasswordStrength(password) {
  if (!password) {
    return { score: 0, label: '', color: T.borderMedium };
  }
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Za-z]/.test(password) && /[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score, label: 'WEAK', color: T.weak };
  if (score <= 2) return { score, label: 'MEDIUM', color: T.medium };
  return { score, label: 'STRONG', color: T.strong };
}

// ---------------------------------------------------------------------------
// UI Atoms
// ---------------------------------------------------------------------------

function EyeIcon({ visible, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.eyeButton}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
    >
      <Ionicons
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        size={18}
        color={T.textMuted}
      />
    </TouchableOpacity>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  focused,
  onFocus,
  onBlur,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.fieldGroup}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrapper, focused && styles.inputWrapperActive]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.textDim}
          secureTextEntry={secure ? !visible : false}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={autoComplete}
          textContentType={textContentType}
          keyboardType={keyboardType}
          style={styles.input}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        {secure ? <EyeIcon visible={visible} onPress={() => setVisible((v) => !v)} /> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.primaryButton, (loading || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color={T.textPrimary} />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function OutlineBtn({ label, onPress, loading, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.secondaryButton, (loading || disabled) && styles.buttonDisabled]}
      onPress={onPress}
      disabled={loading || disabled}
    >
      {loading ? (
        <ActivityIndicator color={T.indigo} />
      ) : (
        <Text style={styles.secondaryButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function Tabs({ active, onChange }) {
  return (
    <View style={styles.tabsRow}>
      <TouchableOpacity
        style={[styles.tabItem, active === 'signin' && styles.tabItemActive]}
        onPress={() => onChange('signin')}
      >
        <Text style={[styles.tabText, active === 'signin' && styles.tabTextActive]}>
          Sign In
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tabItem, active === 'signup' && styles.tabItemActive]}
        onPress={() => onChange('signup')}
      >
        <Text style={[styles.tabText, active === 'signup' && styles.tabTextActive]}>
          Sign Up
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StrengthMeter({ password }) {
  const { score, label, color } = useMemo(() => getPasswordStrength(password), [password]);
  const segments = [0, 1, 2, 3];

  if (!password) return null;

  return (
    <View style={styles.strengthContainer}>
      <View style={styles.strengthBarRow}>
        {segments.map((i) => (
          <View
            key={i}
            style={[
              styles.strengthSegment,
              { backgroundColor: i < score ? color : T.borderMedium },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
}

// Toast shown briefly at the top of the screen. Distinct from the inline
// `banner` used for form-validation/API feedback.
function Toast({ message }) {
  if (!message) return null;
  return (
    <View style={styles.toast}>
      <Ionicons name="checkmark-circle" size={18} color={T.green} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

// Rounded purple logo badge with the "S" mark, app title, and the green
// "CITIZEN PROTECTION PORTAL" status pill.
function BrandHeader() {
  return (
    <View style={styles.headerBlock}>
            <Image
       source={require('../assets/LOGO1.png')}
        style={styles.logoImage}
        resizeMode="contain"
      />
      <Text style={styles.appName}>Sentinel</Text>
      <View style={styles.statusPill}>
        <View style={styles.statusDot} />
        <Text style={styles.statusPillText}>CITIZEN PROTECTION PORTAL</Text>
      </View>
    </View>
  );
}

function LegalFooter() {
  return (
    <View style={styles.footerBlock}>
      <Text style={styles.footerText}>
        Protected under RA 10175 — Philippine Cybercrime Prevention Act
      </Text>
    </View>
  );
}

// Outer shell that frames the auth card, brand header, and footer.
function PhoneShell({ children, title }) {
  return (
    <View style={styles.shell}>
      <BrandHeader />
      <View style={styles.card}>
        {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
        {children}
      </View>
      <LegalFooter />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Forgot Password Sheet
//
// Defined HERE — before SignInScreen — because:
//   • ForgotPasswordSheet reads `sheetStyles` at render time
//   • `sheetStyles` is a `const` (StyleSheet.create call) — not hoisted
//   • If sheetStyles were declared after SignInScreen, tapping
//     "Forgot password?" would crash with:
//       "ReferenceError: Cannot access 'sheetStyles' before initialization"
// ---------------------------------------------------------------------------

function OtpDigitsMeter({ value }) {
  const length = 6;
  const digits = String(value || '').split('');
  return (
    <View style={sheetStyles.otpRow}>
      {Array.from({ length }).map((_, i) => {
        const char = digits[i];
        const filled = Boolean(char);
        const isActive = i === digits.length;
        return (
          <View
            key={i}
            style={[
              sheetStyles.otpCell,
              filled && sheetStyles.otpCellFilled,
              isActive && sheetStyles.otpCellActive,
            ]}
          >
            <Text style={sheetStyles.otpCellText}>{char || ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ForgotPasswordSheet({ visible, onClose }) {
  const {
    requestPasswordOtp,
    verifyPasswordOtp,
    resetPasswordWithOtp,
    isLoading,
    isOffline,
  } = useAuth();

  const [stage, setStage] = useState(1); // 1=email, 2=otp, 3=password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetSessionToken, setResetSessionToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const otpLength = 6;

  const resetState = () => {
    setStage(1);
    setEmail('');
    setOtp('');
    setResetSessionToken('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPw(false);
    setShowConfirmPw(false);
    setError(null);
    setSuccess(false);
    setFocusedField(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSendOtp = async () => {
    setError(null);
    if (!email || !EMAIL_REGEX.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    try {
      await requestPasswordOtp(email.trim());
      setStage(2);
    } catch (err) {
      setError(err?.message || 'Could not send the code. Please try again.');
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (otp.length !== otpLength) {
      setError(`Please enter the full ${otpLength}-digit code.`);
      return;
    }
    try {
      const data = await verifyPasswordOtp(email.trim(), otp);
      if (!data?.resetSessionToken) {
        setError('Verification succeeded but the reset session is missing. Please try again.');
        return;
      }
      setResetSessionToken(data.resetSessionToken);
      setStage(3);
    } catch (err) {
      setError(err?.message || 'Incorrect code. Please try again.');
    }
  };

  const passwordsMatch = newPassword === confirmPassword;
  const passwordStrengthOk = isPasswordValid(newPassword);

  const handleResetPassword = async () => {
    setError(null);
    if (!passwordStrengthOk) {
      setError(
        'Password must be at least 8 characters and include a letter and a number.'
      );
      return;
    }
    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }
    try {
      await resetPasswordWithOtp(resetSessionToken, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err?.message || 'Could not reset the password. Please try again.');
    }
  };

  const closeEnabled = !isLoading;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={() => {
        if (closeEnabled) handleClose();
      }}
    >
      <View style={sheetStyles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={sheetStyles.keyboardWrap}
        >
          <View style={sheetStyles.sheet}>
            <View style={sheetStyles.headerRow}>
              <Text style={sheetStyles.title}>Reset Password</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={sheetStyles.closeBtn}
                disabled={!closeEnabled}
                accessibilityLabel="Close"
              >
                <Ionicons name="close-outline" size={22} color={T.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Stage indicator */}
            {!success && (
              <View style={sheetStyles.stageRow}>
                {[1, 2, 3].map((s) => (
                  <View
                    key={s}
                    style={[
                      sheetStyles.stageDot,
                      stage >= s && sheetStyles.stageDotActive,
                    ]}
                  />
                ))}
              </View>
            )}

            {success ? (
              <>
                <View style={sheetStyles.successIconWrap}>
                  <Ionicons name="checkmark-circle-outline" size={34} color={T.green} />
                </View>
                <Text style={sheetStyles.successTitle}>Password updated</Text>
                <Text style={sheetStyles.body}>
                  You can now sign in to SentinelPH with your new password.
                </Text>
                <PrimaryBtn label="Done" onPress={handleClose} />
              </>
            ) : stage === 1 ? (
              <>
                <Text style={sheetStyles.body}>
                  Enter your registered email. We&apos;ll send a 6-digit code to reset
                  your password.
                </Text>

                <View style={sheetStyles.fieldGroup}>
                  <Text style={sheetStyles.label}>EMAIL ADDRESS</Text>
                  <View
                    style={[
                      sheetStyles.inputWrapper,
                      focusedField === 'email' && sheetStyles.inputWrapperActive,
                    ]}
                  >
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={T.textDim}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      style={sheetStyles.input}
                    />
                  </View>
                </View>

                {error && (
                  <View style={sheetStyles.errorBox}>
                    <Text style={sheetStyles.errorText}>{error}</Text>
                  </View>
                )}

                <PrimaryBtn
                  label={isLoading ? 'Sending…' : 'Send Reset Code'}
                  onPress={handleSendOtp}
                  loading={isLoading}
                  disabled={isOffline || !email.trim()}
                />

                <TouchableOpacity style={sheetStyles.cancelBtn} onPress={handleClose}>
                  <Text style={sheetStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : stage === 2 ? (
              <>
                <Text style={sheetStyles.body}>
                  We sent a 6-digit code to{' '}
                  <Text style={{ color: T.textPrimary, fontWeight: '700' }}>
                    {email}
                  </Text>
                  . Enter it below to continue.
                </Text>

                <View style={sheetStyles.fieldGroup}>
                  <Text style={sheetStyles.label}>VERIFICATION CODE</Text>
                  <TextInput
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, otpLength))}
                    placeholder="000000"
                    placeholderTextColor={T.textDim}
                    keyboardType="number-pad"
                    maxLength={otpLength}
                    editable={!isLoading}
                    autoFocus
                    style={sheetStyles.hiddenInput}
                  />
                  <OtpDigitsMeter value={otp} />
                </View>

                {error && (
                  <View style={sheetStyles.errorBox}>
                    <Text style={sheetStyles.errorText}>{error}</Text>
                  </View>
                )}

                <PrimaryBtn
                  label={isLoading ? 'Verifying…' : 'Verify Code'}
                  onPress={handleVerifyOtp}
                  loading={isLoading}
                  disabled={isOffline || otp.length !== otpLength}
                />

                <TouchableOpacity
                  style={sheetStyles.cancelBtn}
                  onPress={() => {
                    setStage(1);
                    setOtp('');
                    setError(null);
                  }}
                >
                  <Text style={sheetStyles.cancelText}>Use a different email</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={sheetStyles.body}>
                  Choose a new password. It must be at least 8 characters and
                  include a letter and a number.
                </Text>

                <View style={sheetStyles.fieldGroup}>
                  <Text style={sheetStyles.label}>NEW PASSWORD</Text>
                  <View
                    style={[
                      sheetStyles.inputWrapper,
                      focusedField === 'new' && sheetStyles.inputWrapperActive,
                    ]}
                  >
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="At least 8 characters"
                      placeholderTextColor={T.textDim}
                      secureTextEntry={!showNewPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                      onFocus={() => setFocusedField('new')}
                      onBlur={() => setFocusedField(null)}
                      style={sheetStyles.input}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPw((v) => !v)}
                      style={sheetStyles.eyeBtn}
                    >
                      <Ionicons
                        name={showNewPw ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={T.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  <StrengthMeter password={newPassword} />
                </View>

                <View style={sheetStyles.fieldGroup}>
                  <Text style={sheetStyles.label}>CONFIRM PASSWORD</Text>
                  <View
                    style={[
                      sheetStyles.inputWrapper,
                      focusedField === 'confirm' && sheetStyles.inputWrapperActive,
                      confirmPassword.length > 0 &&
                        !passwordsMatch &&
                        sheetStyles.inputWrapperError,
                    ]}
                  >
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter your password"
                      placeholderTextColor={T.textDim}
                      secureTextEntry={!showConfirmPw}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                      onFocus={() => setFocusedField('confirm')}
                      onBlur={() => setFocusedField(null)}
                      style={sheetStyles.input}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPw((v) => !v)}
                      style={sheetStyles.eyeBtn}
                    >
                      <Ionicons
                        name={showConfirmPw ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color={T.textMuted}
                      />
                    </TouchableOpacity>
                  </View>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <Text style={sheetStyles.inlineError}>
                      Passwords do not match
                    </Text>
                  )}
                </View>

                {error && (
                  <View style={sheetStyles.errorBox}>
                    <Text style={sheetStyles.errorText}>{error}</Text>
                  </View>
                )}

                <PrimaryBtn
                  label={isLoading ? 'Updating…' : 'Update Password'}
                  onPress={handleResetPassword}
                  loading={isLoading}
                  disabled={
                    isOffline ||
                    !passwordStrengthOk ||
                    !passwordsMatch ||
                    confirmPassword.length === 0
                  }
                />

                <TouchableOpacity
                  style={sheetStyles.cancelBtn}
                  onPress={handleClose}
                >
                  <Text style={sheetStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  keyboardWrap: {
    width: '100%',
    maxWidth: 460,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: '100%',
    backgroundColor: T.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.borderSubtle,
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: T.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  stageRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  stageDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: T.borderMedium,
  },
  stageDotActive: {
    backgroundColor: T.indigo,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: T.textMuted,
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: T.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  label: {
    fontFamily: T.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: T.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: T.inputBg,
  },
  inputWrapperActive: {
    borderColor: T.indigo,
  },
  inputWrapperError: {
    borderColor: T.red,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: T.textBody,
  },
  eyeBtn: {
    padding: 6,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  otpCell: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCellFilled: {
    borderColor: 'rgba(99,102,241,0.55)',
  },
  otpCellActive: {
    borderColor: T.indigo,
  },
  otpCellText: {
    color: T.textPrimary,
    fontSize: 20,
    fontFamily: T.mono,
    fontWeight: '700',
  },
  errorBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    color: T.red,
    fontSize: 12,
  },
  inlineError: {
    color: T.red,
    fontSize: 11,
    marginTop: 6,
    fontFamily: T.mono,
  },
  successIconWrap: {
    alignSelf: 'center',
    backgroundColor: T.inputBg,
    borderWidth: 1,
    borderColor: T.borderMedium,
    borderRadius: 999,
    padding: 16,
    marginBottom: 14,
  },
  cancelBtn: {
    marginTop: 12,
    alignItems: 'center',
    padding: 10,
  },
  cancelText: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

function SignInScreen() {
  const { signIn, switchScreen, isLoading, isOffline } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [focusedField, setFocusedField] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [showForgotSheet, setShowForgotSheet] = useState(false);

  const validate = () => {
    const errors = {};
    if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async () => {
    setBanner(null);
    if (!validate()) return;
    try {
      await signIn(email.trim(), password, rememberMe);
    } catch (err) {
      setBanner({ type: 'error', message: err.message || 'Invalid email or password.' });
    }
  };

  return (
    <>
      {showForgotSheet && (
        <ForgotPasswordSheet
          visible={showForgotSheet}
          onClose={() => setShowForgotSheet(false)}
        />
      )}

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={T.red} />
          <Text style={styles.offlineBannerText}>
            You're offline. Reconnect to sign in or register.
          </Text>
        </View>
      )}

      {banner && (
        <View
          style={[
            styles.banner,
            banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              { color: banner.type === 'error' ? T.red : T.green },
            ]}
          >
            {banner.message}
          </Text>
        </View>
      )}

      <Field
        label="EMAIL ADDRESS"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={fieldErrors.email}
        focused={focusedField === 'email'}
        onFocus={() => setFocusedField('email')}
        onBlur={() => setFocusedField(null)}
      />

      <Field
        label="PASSWORD"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secure
        autoComplete="password"
        textContentType="password"
        error={fieldErrors.password}
        focused={focusedField === 'password'}
        onFocus={() => setFocusedField('password')}
        onBlur={() => setFocusedField(null)}
      />

      <View style={styles.rowBetween}>
        <TouchableOpacity
          style={styles.rememberMeRow}
          onPress={() => setRememberMe((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
        >
          <Ionicons
            name={rememberMe ? 'checkbox' : 'square-outline'}
            size={18}
            color={rememberMe ? T.indigo : T.textMuted}
          />
          <Text style={styles.rememberMeText}>Remember me</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowForgotSheet(true)}>
          <Text style={styles.forgotPasswordText}>Forgot password?</Text>
        </TouchableOpacity>
      </View>

      <PrimaryBtn
        label="Sign In"
        onPress={handleSignIn}
        loading={isLoading}
        disabled={isOffline}
      />

      <TouchableOpacity style={styles.switchModeRow} onPress={() => switchScreen('signup')}>
        <Text style={styles.switchModeText}>
          Don't have an account? <Text style={styles.switchModeLink}>Sign Up</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}

function SignUpScreen() {
  const { signUp, switchScreen, isLoading, isOffline } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);

  const validate = () => {
    const errors = {};
    if (!fullName.trim()) {
      errors.fullName = 'Full name is required.';
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!isPasswordValid(password)) {
      errors.password =
        'Password must be at least 8 characters and include a letter and a number.';
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    if (!agreedToTerms) {
      errors.agreedToTerms = 'You must agree to the Terms and Privacy Policy.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignUp = async () => {
    setBanner(null);
    if (!validate()) return;
    try {
      await signUp(fullName.trim(), email.trim(), password, agreedToTerms);
    } catch (err) {
      setBanner({ type: 'error', message: err.message || 'Registration failed.' });
    }
  };

  return (
    <>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline-outline" size={16} color={T.red} />
          <Text style={styles.offlineBannerText}>
            You're offline. Reconnect to sign in or register.
          </Text>
        </View>
      )}

      {banner && (
        <View
          style={[
            styles.banner,
            banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              { color: banner.type === 'error' ? T.red : T.green },
            ]}
          >
            {banner.message}
          </Text>
        </View>
      )}

      <Field
        label="FULL NAME"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Juan Dela Cruz"
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        error={fieldErrors.fullName}
        focused={focusedField === 'fullName'}
        onFocus={() => setFocusedField('fullName')}
        onBlur={() => setFocusedField(null)}
      />

      <Field
        label="EMAIL ADDRESS"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        error={fieldErrors.email}
        focused={focusedField === 'email'}
        onFocus={() => setFocusedField('email')}
        onBlur={() => setFocusedField(null)}
      />

      <Field
        label="PASSWORD"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldErrors.password}
        focused={focusedField === 'password'}
        onFocus={() => setFocusedField('password')}
        onBlur={() => setFocusedField(null)}
      />
      <StrengthMeter password={password} />

      <Field
        label="CONFIRM PASSWORD"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Re-enter your password"
        secure
        autoComplete="new-password"
        textContentType="newPassword"
        error={fieldErrors.confirmPassword}
        focused={focusedField === 'confirmPassword'}
        onFocus={() => setFocusedField('confirmPassword')}
        onBlur={() => setFocusedField(null)}
      />

      <TouchableOpacity
        style={styles.termsRow}
        onPress={() => setAgreedToTerms((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreedToTerms }}
      >
        <Ionicons
          name={agreedToTerms ? 'checkbox' : 'square-outline'}
          size={18}
          color={agreedToTerms ? T.indigo : T.textMuted}
        />
        <Text style={styles.termsText}>
          I agree to the Terms of Service and Privacy Policy (RA 10173)
        </Text>
      </TouchableOpacity>
      {fieldErrors.agreedToTerms ? (
        <Text style={styles.fieldError}>{fieldErrors.agreedToTerms}</Text>
      ) : null}

      <PrimaryBtn
        label="Sign Up"
        onPress={handleSignUp}
        loading={isLoading}
        disabled={isOffline}
      />

      <TouchableOpacity style={styles.switchModeRow} onPress={() => switchScreen('signin')}>
        <Text style={styles.switchModeText}>
          Already have an account? <Text style={styles.switchModeLink}>Sign In</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}

function VerifyScreen() {
  const {
    checkVerificationStatus,
    resendVerification,
    switchScreen,
    emailForVerification,
    isLoading,
    isOffline,
  } = useAuth();

  const [banner, setBanner] = useState(null);
  const [toast, setToast] = useState(null);

  const handleCheckVerification = async () => {
    setBanner(null);
    const verified = await checkVerificationStatus();
    if (verified) {
      setBanner({ type: 'success', message: 'Email verified! You can continue.' });
    } else {
      setBanner({
        type: 'error',
        message: 'Still not verified. Check your inbox (and spam folder) for the link.',
      });
    }
  };

  const handleResend = async () => {
    setBanner(null);
    try {
      await resendVerification();
      setToast('Verification email sent — check your inbox.');
      setBanner({ type: 'success', message: 'Verification email sent — check your inbox.' });
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setBanner({ type: 'error', message: err.message || 'Could not resend email.' });
    }
  };

  return (
    <>
      <Toast message={toast} />

      {banner && (
        <View
          style={[
            styles.banner,
            banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              { color: banner.type === 'error' ? T.red : T.green },
            ]}
          >
            {banner.message}
          </Text>
        </View>
      )}

      <View style={styles.verifyIconWrap}>
        <Ionicons name="mail-unread-outline" size={36} color={T.indigo} />
      </View>
      <Text style={styles.verifyBody}>
        We sent a verification link to the address below. Tap the link, then come back and
        check your status.
      </Text>

      <View style={styles.emailChip}>
        <Ionicons name="mail-outline" size={14} color={T.indigo} />
        <Text style={styles.emailChipText}>{emailForVerification || 'your email address'}</Text>
      </View>

      <PrimaryBtn
        label="Check Verification Status"
        onPress={handleCheckVerification}
        loading={isLoading}
        disabled={isOffline}
      />

      <OutlineBtn
        label="Resend Verification Link"
        onPress={handleResend}
        loading={isLoading}
        disabled={isOffline}
      />

      <TouchableOpacity style={styles.switchModeRow} onPress={() => switchScreen('signin')}>
        <Text style={styles.switchModeText}>
          Wrong email? <Text style={styles.switchModeLink}>Back to Sign In</Text>
        </Text>
      </TouchableOpacity>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root screen
// ---------------------------------------------------------------------------

export default function AuthScreen() {
  const { currentScreen, switchScreen } = useAuth();

  const titleFor = {
    signin: 'Sign In',
    signup: 'Create Account',
    verify: 'Check your email',
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <PhoneShell title={titleFor[currentScreen]}>
          {currentScreen !== 'verify' && (
            <Tabs active={currentScreen} onChange={switchScreen} />
          )}
          {currentScreen === 'signin' && <SignInScreen />}
          {currentScreen === 'signup' && <SignUpScreen />}
          {currentScreen === 'verify' && <VerifyScreen />}
        </PhoneShell>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: T.canvas },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  shell: {
    width: '100%',
  },

  // Brand header
  headerBlock: {
    marginBottom: 24,
    alignItems: 'center',
  },
  logoBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: T.indigoDark,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: T.indigo,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 6,
  },
  logoLetter: {
    color: T.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  logoImage: {
  width: 110,
    height: 110,
    marginBottom: 12,
  
},
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: T.textPrimary,
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.green,
  },
  statusPillText: {
    fontFamily: T.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: T.green,
  },

  // Toast
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.borderMedium,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  toastText: {
    color: T.textBody,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },

  // Banners
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  offlineBannerText: {
    color: T.red,
    fontSize: 13,
    flexShrink: 1,
  },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  bannerError: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.25)',
  },
  bannerSuccess: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  bannerText: { fontSize: 13, fontWeight: '500' },

  // Card
  card: {
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.borderSubtle,
    padding: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: T.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: T.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.borderMedium,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabItemActive: {
    backgroundColor: T.indigoDark,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textMuted,
  },
  tabTextActive: {
    color: T.textPrimary,
  },

  // Fields
  fieldGroup: {
    marginBottom: 2,
  },
  label: {
    fontFamily: T.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: T.textMuted,
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.borderMedium,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: T.inputBg,
  },
  inputWrapperActive: {
    borderColor: T.indigo,
  },
  input: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 14,
    color: T.textBody,
  },
  eyeButton: {
    padding: 6,
  },
  fieldError: {
    color: T.red,
    fontSize: 12,
    marginTop: 6,
  },

  // Strength meter
  strengthContainer: {
    marginTop: 8,
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    marginTop: 6,
    fontFamily: T.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Remember me / forgot password
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rememberMeText: {
    fontSize: 13,
    color: T.textBody,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: T.indigo,
    fontWeight: '600',
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: T.textBody,
    lineHeight: 17,
  },

  // Buttons
  primaryButton: {
    backgroundColor: T.indigoDark,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: T.indigo,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: T.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: T.borderHighlight,
    backgroundColor: T.inputBg,
  },
  secondaryButtonText: {
    color: T.indigo,
    fontSize: 15,
    fontWeight: '700',
  },
  switchModeRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 13,
    color: T.textMuted,
  },
  switchModeLink: {
    color: T.indigo,
    fontWeight: '700',
  },

  // Verify screen
  verifyIconWrap: {
    alignSelf: 'center',
    backgroundColor: T.inputBg,
    borderWidth: 1,
    borderColor: T.borderMedium,
    borderRadius: 999,
    padding: 16,
    marginBottom: 14,
  },
  verifyBody: {
    fontSize: 13,
    color: T.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 14,
  },
  emailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: T.inputBg,
    borderWidth: 1,
    borderColor: T.borderHighlight,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  emailChipText: {
    fontFamily: T.mono,
    fontSize: 12,
    fontWeight: '700',
    color: T.textPrimary,
  },

  // Footer
  footerBlock: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: T.textDim,
    textAlign: 'center',
    lineHeight: 16,
  },
});