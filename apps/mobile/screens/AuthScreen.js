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
  ActivityIndicator,
  KeyboardAvoidingView,
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
      <View style={styles.logoBadge}>
        <Text style={styles.logoLetter}>S</Text>
      </View>
      <Text style={styles.appName}>SentinelPH</Text>
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

        <TouchableOpacity>
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