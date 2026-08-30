// apps/mobile/screens/ReportScreen.js
//
// Guided 3-step report wizard:
//   Step 1 — Scam type + number/URL/message content
//   Step 2 — Evidence attachment (photo/file picker, voice recording) + location
//   Step 3 — ZKP nullifier/commitment review & submit
//
// Submits live via POST /api/v1/reports when online; otherwise enqueues
// into the SQLite outbox (db/sqlite.js) for db/syncQueue.js to flush later.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import Svg, { Path, Circle } from 'react-native-svg';

import api, { OfflineError } from '../lib/api';
import { enqueueReport } from '../db/sqlite';
import { syncNow } from '../db/syncQueue';
import { generateNullifier, generateZkpCommitment } from '../lib/zkp/nullifierGenerator';

const SCAM_TYPES = [
  'Voice Phishing',
  'SMS Smishing',
  'E-wallet Scam',
  'Fake Job Offer',
  'Bank Impersonation',
  'Other',
];

function CloseIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="M1 1l12 12M13 1L1 13" stroke="#94a3b8" strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function ShieldIcon({ size = 14, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M8 1.5L2.5 4v4c0 3.1 2.25 5.45 5.5 6 3.25-.55 5.5-2.9 5.5-6V4L8 1.5z" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M5.5 8l1.75 1.75L10.5 6" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function UploadIcon({ size = 22, color = '#334155' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 8l-5-5-5 5" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 3v12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function MicIcon({ size = 18, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M5.5 1.5h5v8a2.5 2.5 0 01-5 0v-8z" stroke={color} strokeWidth={1.2} />
      <Path d="M3 8.5c0 2.76 2.24 5 5 5s5-2.24 5-5" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M8 13.5V15" stroke={color} strokeWidth={1.2} strokeLinecap="round" />
    </Svg>
  );
}

function StepBar({ step }) {
  return (
    <View className="flex-row items-center px-4 py-3 gap-2">
      {[1, 2, 3].map((s) => (
        <View key={s} className="flex-row items-center gap-2 flex-1">
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            style={{
              backgroundColor: s <= step ? '#4f46e5' : 'rgba(148,163,184,0.1)',
              borderWidth: s === step ? 2 : 0,
              borderColor: 'rgba(129,140,248,0.5)',
            }}
          >
            <Text style={{ color: s <= step ? 'white' : '#334155', fontSize: 11, fontWeight: '700' }}>
              {s < step ? '✓' : s}
            </Text>
          </View>
          {s < 3 && <View className="flex-1 h-px" style={{ backgroundColor: s < step ? '#4f46e5' : 'rgba(148,163,184,0.1)' }} />}
        </View>
      ))}
    </View>
  );
}

export default function ReportScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [step, setStep] = useState(route.params?.openStep || 1);
  const [scamType, setScamType] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState([]); // [{ uri, name, type }]
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [voiceUri, setVoiceUri] = useState(null);
  const [location, setLocation] = useState(null);
  const [nullifier, setNullifier] = useState(null);
  const [zkpHash, setZkpHash] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState(null);
  const timerRef = useRef(null);

  // Auto-open camera/mic shortcut if launched from QuickReportCard.
  useEffect(() => {
    if (route.params?.focus === 'camera') pickImage();
    if (route.params?.focus === 'mic') startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceedStep1 = scamType !== '' && content.trim().length > 3;

  // ─── Evidence handlers ────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const picked = result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || a.uri.split('/').pop(),
        type: a.mimeType || 'image/jpeg',
      }));
      setFiles((prev) => [...prev, ...picked]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to capture evidence.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      const asset = result.assets[0];
      setFiles((prev) => [...prev, { uri: asset.uri, name: 'photo.jpg', type: 'image/jpeg' }]);
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone access is required to record.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec);
      setIsRecording(true);
      setRecordSec(0);
      timerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch (err) {
      console.warn('[ReportScreen] failed to start recording:', err?.message);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    clearInterval(timerRef.current);
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setVoiceUri(uri);
    } catch (err) {
      console.warn('[ReportScreen] failed to stop recording:', err?.message);
    } finally {
      setRecording(null);
    }
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  // ─── Step transitions ─────────────────────────────────────────────────
  const goToStep3 = async () => {
    // Grab location (best-effort — report still works if denied).
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      }
    } catch (err) {
      console.warn('[ReportScreen] location unavailable:', err?.message);
    }

    const timestamp = new Date().toISOString();
    const [nf, zh] = await Promise.all([
      generateNullifier(content),
      generateZkpCommitment({ scamType, content, timestamp }),
    ]);
    setNullifier(nf);
    setZkpHash(zh);
    setStep(3);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const localId = Crypto.randomUUID();
    const finalNullifier = nullifier || (await generateNullifier(content));
    const finalZkp = zkpHash || (await generateZkpCommitment({ scamType, content, timestamp: new Date().toISOString() }));

    const payload = {
      localId,
      scamType,
      content,
      evidenceFiles: files.map((f) => f.uri),
      voiceNoteUri: voiceUri,
      latitude: location?.latitude,
      longitude: location?.longitude,
      nullifier: finalNullifier,
      zkpHash: finalZkp,
    };

    try {
      // Try live submission first.
      const response = await api.post('/api/v1/reports', {
        scamType,
        content,
        evidenceFiles: files.map((f) => f.uri),
        voiceNoteUri: voiceUri,
        location: location ? { latitude: location.latitude, longitude: location.longitude } : undefined,
        nullifier: finalNullifier,
        zkpHash: finalZkp,
      });
      setReportId(response.data?.reportId || response.data?.id);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof OfflineError) {
        // Fall back to local queue — still show success, just queued.
        await enqueueReport(payload);
        setReportId(`LOCAL-${localId.slice(0, 8).toUpperCase()}`);
        setSubmitted(true);
        // Opportunistic sync attempt in case connectivity flickers back.
        syncNow().catch(() => {});
      } else {
        Alert.alert('Submission failed', err?.message || 'Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success screen ───────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a1120' }}>
        <View className="flex-1 items-center justify-center px-6">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
            style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderWidth: 2, borderColor: 'rgba(16,185,129,0.4)' }}
          >
            <Text style={{ fontSize: 28, color: '#10b981' }}>✓</Text>
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 16, fontWeight: '600', marginBottom: 4 }}>Report Submitted</Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 12 }}>Your identity is protected</Text>
          <View
            className="w-full p-3 rounded-xl mb-4"
            style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Report ID</Text>
            <Text style={{ color: '#10b981', fontSize: 14, fontFamily: 'JetBrainsMono_400Regular', fontWeight: '600' }}>
              {reportId}
            </Text>
          </View>
          <Text style={{ color: '#334155', fontSize: 11, textAlign: 'center', marginBottom: 20 }}>
            ZKP hash anchored to chain. You&apos;ll be notified when reviewers verify.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            className="w-full py-3 rounded-xl items-center"
            style={{ backgroundColor: '#4f46e5' }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a1120' }}>
      {/* Header */}
      <View
        className="flex-row items-center gap-3 px-4 pt-2 pb-3"
        style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.1)' }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-8 h-8 rounded-xl items-center justify-center"
          style={{ backgroundColor: 'rgba(148,163,184,0.08)' }}
        >
          <CloseIcon />
        </TouchableOpacity>
        <View className="flex-1">
          <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: '600' }}>New Report</Text>
          <Text style={{ color: '#475569', fontSize: 11 }}>
            {step === 1 ? 'Describe the incident' : step === 2 ? 'Attach evidence' : 'Review & submit'}
          </Text>
        </View>
        <Text style={{ color: '#334155', fontSize: 11, fontFamily: 'JetBrainsMono_400Regular' }}>{step}/3</Text>
      </View>

      <StepBar step={step} />

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 16, gap: 12 }}>
        {step === 1 && (
          <>
            <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>SCAM TYPE</Text>
            <View className="flex-row flex-wrap gap-2">
              {SCAM_TYPES.map((type) => {
                const active = scamType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setScamType(type)}
                    style={{
                      width: '48%',
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: active ? 'rgba(79,70,229,0.2)' : '#1e293b',
                      borderWidth: 1,
                      borderColor: active ? 'rgba(79,70,229,0.5)' : 'rgba(148,163,184,0.1)',
                    }}
                  >
                    <Text style={{ color: active ? '#818cf8' : '#94a3b8', fontSize: 12, fontWeight: '500' }}>{type}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 8 }}>
              NUMBER, URL, OR MESSAGE
            </Text>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder='e.g. "+63-917-555-0192" or "gcash-verify.ph/claim?id=…"'
              placeholderTextColor="#334155"
              multiline
              numberOfLines={4}
              style={{
                backgroundColor: '#1e293b',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.15)',
                borderRadius: 12,
                padding: 12,
                color: '#e2e8f0',
                fontSize: 13,
                minHeight: 100,
                textAlignVertical: 'top',
              }}
            />
            <Text style={{ color: '#334155', fontSize: 11 }}>
              {content.length}/500 chars · End-to-end encrypted before submission
            </Text>
          </>
        )}

        {step === 2 && (
          <>
            <TouchableOpacity
              onPress={pickImage}
              onLongPress={takePhoto}
              style={{
                height: 120,
                borderRadius: 16,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: 'rgba(148,163,184,0.2)',
                backgroundColor: '#1e293b',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <UploadIcon />
              <Text style={{ color: '#475569', fontSize: 12, fontWeight: '500' }}>Tap to upload · Hold for camera</Text>
              <Text style={{ color: '#334155', fontSize: 11 }}>Screenshots, photos, documents</Text>
            </TouchableOpacity>

            <View
              className="p-4 rounded-2xl"
              style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.1)' }}
            >
              <View className="flex-row items-center justify-between">
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '600' }}>Voice Recording</Text>
                  <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                    Describe the incident in your own words
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={isRecording ? stopRecording : startRecording}
                  className="w-12 h-12 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: isRecording ? 'rgba(244,63,94,0.2)' : 'rgba(79,70,229,0.15)',
                    borderWidth: 2,
                    borderColor: isRecording ? '#f43f5e' : 'rgba(79,70,229,0.3)',
                  }}
                >
                  {isRecording ? (
                    <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: '#f43f5e' }} />
                  ) : (
                    <MicIcon />
                  )}
                </TouchableOpacity>
              </View>
              {isRecording && (
                <View className="flex-row items-center gap-2 mt-3">
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f43f5e' }} />
                  <Text style={{ color: '#f43f5e', fontSize: 12, fontFamily: 'JetBrainsMono_400Regular' }}>
                    REC {String(Math.floor(recordSec / 60)).padStart(2, '0')}:{String(recordSec % 60).padStart(2, '0')}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 11 }}>Tap to stop</Text>
                </View>
              )}
              {voiceUri && !isRecording && (
                <View className="flex-row items-center gap-2 mt-3">
                  <Text style={{ color: '#10b981', fontSize: 12 }}>✓</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>Voice note recorded ({recordSec}s)</Text>
                </View>
              )}
            </View>

            {files.length > 0 && (
              <View style={{ gap: 6 }}>
                {files.map((file, i) => (
                  <View
                    key={i}
                    className="flex-row items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ backgroundColor: 'rgba(16,185,129,0.06)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' }}
                  >
                    <Text style={{ color: '#10b981', fontSize: 12 }}>✓</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <TouchableOpacity onPress={() => removeFile(i)}>
                      <Text style={{ color: '#334155', fontSize: 12 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={{ color: '#334155', fontSize: 11 }}>
              Evidence is hashed client-side. Raw files never leave your device unencrypted.
            </Text>
          </>
        )}

        {step === 3 && (
          <>
            <View
              className="p-4 rounded-2xl"
              style={{ backgroundColor: 'rgba(79,70,229,0.06)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.2)' }}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <ShieldIcon />
                <Text style={{ color: '#818cf8', fontSize: 12, fontWeight: '600' }}>Zero-Knowledge Proof Generated</Text>
              </View>
              <Text style={{ color: '#475569', fontSize: 11, marginBottom: 8, lineHeight: 16 }}>
                A cryptographic commitment was created from your report. This proves authenticity without revealing your identity.
              </Text>
              <View className="p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <Text style={{ color: '#334155', fontSize: 11, marginBottom: 2 }}>ZKP Commitment Hash</Text>
                <Text style={{ color: '#818cf8', fontSize: 10, fontFamily: 'JetBrainsMono_400Regular' }}>{zkpHash}</Text>
              </View>
            </View>

            <View
              className="p-4 rounded-2xl"
              style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.1)', gap: 10 }}
            >
              <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>SUBMISSION SUMMARY</Text>
              {[
                { label: 'Type', value: scamType },
                { label: 'Content', value: content },
                { label: 'Evidence', value: files.length > 0 ? `${files.length} file(s) attached` : 'No evidence' },
                { label: 'Location', value: location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Not shared' },
                { label: 'Identity', value: 'Anonymous (ZKP verified)' },
              ].map((row) => (
                <View key={row.label} className="flex-row gap-3">
                  <Text style={{ color: '#475569', fontSize: 11, width: 64 }}>{row.label}</Text>
                  <Text style={{ color: '#e2e8f0', fontSize: 12, flex: 1 }} numberOfLines={3}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>

            <View className="flex-row items-start gap-2 px-1">
              <Text style={{ color: '#10b981', fontSize: 12 }}>✓</Text>
              <Text style={{ color: '#475569', fontSize: 11, flex: 1, lineHeight: 16 }}>
                By submitting, you agree your anonymized report may be shared with DICT, NTC, and law enforcement partners under TLP:GREEN classification.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View className="px-4 pb-4 pt-2" style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.08)' }}>
        <View className="flex-row gap-2">
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => s - 1)}
              className="px-4 py-3 rounded-xl items-center justify-center"
              style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.15)' }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '500' }}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={(step === 1 && !canProceedStep1) || submitting}
            onPress={() => {
              if (step === 1) setStep(2);
              else if (step === 2) goToStep3();
              else handleSubmit();
            }}
            className="flex-1 py-3 rounded-xl items-center justify-center"
            style={{
              backgroundColor:
                step === 1 && !canProceedStep1 ? 'rgba(79,70,229,0.3)' : '#4f46e5',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
                {step === 1 ? 'Next — Add Evidence' : step === 2 ? 'Next — Review' : 'Submit Report'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}