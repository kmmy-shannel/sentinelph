// apps/mobile/screens/AuthScreen.js
//
// Ported from the Figma Make MobileLogin.tsx prototype. Same dark theme
// (#09090f bg, #22c55e accent, JetBrains Mono labels), same copy, same
// two-step phone -> OTP flow — adapted to real Firebase phone auth via
// useAuth() instead of the prototype's setTimeout-mocked handlers.
//
// Deliberately dropped from the original: the fake phone bezel and
// hand-drawn SVG status bar. Those existed only to preview the design on
// a desktop browser; on a real device the OS renders the actual status
// bar, so we use expo-status-bar instead of recreating it in SVG.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '../context/AuthContext';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 300; // 05:00, matches the original copy

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function AuthScreen() {
  const { sendOtp, confirmOtp, resetOtpSession } = useAuth();

  const [screen, setScreen] = useState('home'); // 'home' | 'otp'
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SEC);

  const otpInputRefs = useRef([]);
  const cooldownTimerRef = useRef(null);

  useEffect(() => {
    return () => clearInterval(cooldownTimerRef.current);
  }, []);

  const startCooldown = useCallback(() => {
    clearInterval(cooldownTimerRef.current);
    setCooldown(RESEND_COOLDOWN_SEC);
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const fullPhoneNumber = `+63${phone}`;

  const handleSendOtp = async () => {
    if (!phone || !agreed || loading) return;
    setError('');
    setLoading(true);
    try {
      await sendOtp(fullPhoneNumber);
      setOtp(Array(OTP_LENGTH).fill(''));
      setScreen('otp');
      startCooldown();
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setError('');
    setLoading(true);
    try {
      await sendOtp(fullPhoneNumber);
      setOtp(Array(OTP_LENGTH).fill(''));
      startCooldown();
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...otp];
    next[index] = value;
    setOtp(next);
    if (value && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index, e) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    if (loading || !otp.every((d) => d !== '')) return;
    setError('');
    setLoading(true);
    try {
      await confirmOtp(otp.join(''));
      // No manual navigation needed — App.js's RootNavigator watches
      // isAuthenticated and swaps to TabNavigator automatically.
    } catch (err) {
      setError(mapFirebaseError(err));
      setOtp(Array(OTP_LENGTH).fill(''));
      otpInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const goBackToHome = () => {
    resetOtpSession();
    clearInterval(cooldownTimerRef.current);
    setError('');
    setScreen('home');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090f' }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {screen === 'home' && (
            <View className="flex-1 pt-6">
              {/* Brand header */}
              <View className="flex-row items-center gap-2.5 mb-10">
                <View
                  className="w-9 h-9 rounded-xl items-center justify-center"
                  style={{ backgroundColor: '#22c55e' }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>S</Text>
                </View>
                <View>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>SentinelPH</Text>
                  <Text
                    style={{
                      color: '#4b5563',
                      fontSize: 10,
                      fontFamily: 'JetBrainsMono_400Regular',
                      letterSpacing: 1.2,
                    }}
                  >
                    CITIZEN PORTAL
                  </Text>
                </View>
              </View>

              {/* Headline */}
              <View className="mb-8">
                <Text
                  style={{
                    color: '#22c55e',
                    fontSize: 11,
                    fontWeight: '500',
                    fontFamily: 'JetBrainsMono_400Regular',
                    letterSpacing: 2.5,
                    marginBottom: 12,
                  }}
                >
                  REPORT · TRACK · PROTECT
                </Text>
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 26,
                    fontWeight: '800',
                    letterSpacing: -0.5,
                    lineHeight: 32,
                    marginBottom: 8,
                  }}
                >
                  Report Scams.{'\n'}Stay Protected.
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 14, lineHeight: 20 }}>
                  Join thousands of Filipinos helping stop fraud. Enter your mobile number to get started.
                </Text>
              </View>

              {/* Trust badges */}
              <View className="flex-row flex-wrap gap-2 mb-8">
                {['DICT Verified', 'RA 10175', 'End-to-End Encrypted'].map((label) => (
                  <View
                    key={label}
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: '#111118', borderWidth: 1, borderColor: '#1e1e30' }}
                  >
                    <Text style={{ color: '#4b5563', fontFamily: 'JetBrainsMono_400Regular', fontSize: 9 }}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Phone input */}
              <View style={{ gap: 16 }}>
                <View>
                  <Text
                    style={{
                      color: '#6b7280',
                      fontSize: 11,
                      fontFamily: 'JetBrainsMono_400Regular',
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    MOBILE NUMBER
                  </Text>
                  <View
                    className="flex-row items-center rounded-xl overflow-hidden"
                    style={{ borderWidth: 1, borderColor: '#1e1e30', backgroundColor: '#0d0d14' }}
                  >
                    <View
                      className="px-3 py-3.5"
                      style={{ borderRightWidth: 1, borderRightColor: '#1e1e30' }}
                    >
                      <Text style={{ color: '#6b7280', fontSize: 13, fontFamily: 'JetBrainsMono_400Regular' }}>
                        🇵🇭 +63
                      </Text>
                    </View>
                    <TextInput
                      value={phone}
                      onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9XX XXX XXXX"
                      placeholderTextColor="#374151"
                      keyboardType="number-pad"
                      maxLength={10}
                      style={{
                        flex: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        color: '#e2e8f0',
                        fontSize: 13,
                        fontFamily: 'JetBrainsMono_400Regular',
                      }}
                    />
                  </View>
                </View>

                {/* Consent checkbox */}
                <View className="flex-row items-start gap-2.5">
                  <TouchableOpacity
                    onPress={() => setAgreed((a) => !a)}
                    className="w-4 h-4 rounded items-center justify-center"
                    style={{
                      marginTop: 2,
                      backgroundColor: agreed ? '#22c55e' : '#111118',
                      borderWidth: 1.5,
                      borderColor: agreed ? '#22c55e' : '#1e1e30',
                    }}
                  >
                    {agreed && <Text style={{ color: '#fff', fontSize: 10, lineHeight: 10 }}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={{ color: '#4b5563', fontSize: 11, lineHeight: 16, flex: 1 }}>
                    I agree to SentinelPH&apos;s <Text style={{ color: '#22c55e' }}>Terms of Service</Text> and{' '}
                    <Text style={{ color: '#22c55e' }}>Privacy Policy</Text>. My data is protected under RA 10173.
                  </Text>
                </View>

                {error ? <Text style={{ color: '#f87171', fontSize: 11 }}>{error}</Text> : null}

                <TouchableOpacity
                  onPress={handleSendOtp}
                  disabled={loading || !phone || !agreed}
                  className="w-full py-3.5 rounded-xl items-center justify-center flex-row"
                  style={{
                    backgroundColor: loading || !phone || !agreed ? '#1a2e1a' : '#22c55e',
                    gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Sending OTP…</Text>
                    </>
                  ) : (
                    <Text
                      style={{
                        color: !phone || !agreed ? '#374151' : '#fff',
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      Send OTP →
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }} />
              <View className="items-center pt-8 pb-2">
                <Text style={{ color: '#1f2937', fontSize: 11 }}>
                  Officer? Use the <Text style={{ color: '#3b82f6' }}>Web Control Center</Text>
                </Text>
              </View>
            </View>
          )}

          {screen === 'otp' && (
            <View className="flex-1 pt-6">
              <TouchableOpacity onPress={goBackToHome} className="mb-8">
                <Text
                  style={{ color: '#4b5563', fontSize: 11, fontFamily: 'JetBrainsMono_400Regular' }}
                >
                  ← BACK
                </Text>
              </TouchableOpacity>

              <View className="mb-8">
                <Text
                  style={{
                    color: '#22c55e',
                    fontSize: 11,
                    fontWeight: '500',
                    fontFamily: 'JetBrainsMono_400Regular',
                    letterSpacing: 2.5,
                    marginBottom: 12,
                  }}
                >
                  VERIFICATION
                </Text>
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 }}>
                  Enter OTP Code
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 14, lineHeight: 20 }}>
                  We sent a 6-digit code to{' '}
                  <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'JetBrainsMono_400Regular' }}>
                    +63 {phone}
                  </Text>
                </Text>
              </View>

              <View className="flex-row gap-2 mb-6">
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    value={digit}
                    onChangeText={(v) => handleOtpChange(index, v)}
                    onKeyPress={(e) => handleOtpKeyPress(index, e)}
                    keyboardType="number-pad"
                    maxLength={1}
                    style={{
                      flex: 1,
                      height: 56,
                      borderRadius: 12,
                      textAlign: 'center',
                      fontSize: 20,
                      fontWeight: '700',
                      color: '#e2e8f0',
                      fontFamily: 'JetBrainsMono_400Regular',
                      backgroundColor: '#0d0d14',
                      borderWidth: 1.5,
                      borderColor: digit ? '#22c55e' : '#1e1e30',
                    }}
                  />
                ))}
              </View>

              {error ? <Text style={{ color: '#f87171', fontSize: 11, marginBottom: 12 }}>{error}</Text> : null}

              <TouchableOpacity
                onPress={handleVerify}
                disabled={loading || !otp.every((d) => d !== '')}
                className="w-full py-3.5 rounded-xl items-center justify-center flex-row mb-4"
                style={{
                  backgroundColor: loading || !otp.every((d) => d !== '') ? '#1a2e1a' : '#22c55e',
                  gap: 8,
                }}
              >
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Verifying…</Text>
                  </>
                ) : (
                  <Text
                    style={{
                      color: !otp.every((d) => d !== '') ? '#374151' : '#fff',
                      fontSize: 13,
                      fontWeight: '600',
                    }}
                  >
                    Verify & Continue →
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={{ textAlign: 'center', color: '#4b5563', fontSize: 11 }}>
                Didn&apos;t receive it?{' '}
                <Text
                  onPress={handleResend}
                  style={{ color: cooldown > 0 ? '#374151' : '#22c55e' }}
                >
                  Resend OTP
                </Text>{' '}
                <Text style={{ color: '#1f2937' }}>
                  {cooldown > 0 ? `· expires in ${formatCountdown(cooldown)}` : '· code expired'}
                </Text>
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Translates Firebase Auth error codes into copy consistent with the
 * screen's tone, instead of surfacing raw "Firebase: Error (auth/...)"
 * strings to citizens.
 */
function mapFirebaseError(err) {
  const code = err?.code || '';
  if (code.includes('invalid-phone-number')) return 'That mobile number doesn\u2019t look right.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  if (code.includes('invalid-verification-code')) return 'Incorrect code. Please check and try again.';
  if (code.includes('code-expired')) return 'That code expired — request a new one.';
  if (code.includes('network-request-failed')) return 'Network error — check your connection.';
  return err?.message || 'Something went wrong. Please try again.';
}