// apps/mobile/screens/ReportScreen.js
//
// Guided 2-step report wizard with Layer 1 instant AI warning:
//   Step 1 — Report Intake & Analysis
//            · Optional sender identifier
//            · Mutually exclusive: Screenshot upload (OCR) OR typed message
//            · Debounced AI scam analysis + reasoning
//            · Optional collapsible extra evidence (files / voice)
//   Step 2 — Review & ZKP Verification
//            · ZKP commitment hash, full submission summary, final submit
//
// Submits live via POST /api/v1/reports when online; otherwise enqueues
// into the SQLite outbox (db/sqlite.js) for db/syncQueue.js to flush later.
// Layer 1 preview calls POST /api/v1/reports/analyze (advisory-only,
// mirrors the AI microservice's /predict — never blacklists anything).

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import Svg, { Path, Circle } from 'react-native-svg';

import api, { OfflineError } from '../lib/api';
import { enqueueReport } from '../db/sqlite';
import { syncNow } from '../db/syncQueue';
import { generateNullifier, generateZkpCommitment } from '../lib/zkp/nullifierGenerator';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ANALYZE_DEBOUNCE_MS = 700;
const MIN_ANALYZE_CHARS = 8;

const RISK_STYLES = {
  // ... [keep unchanged]
  HIGH: { bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.35)', text: '#fb7185', label: 'Likely Scam', glow: 'rgba(244,63,94,0.12)', accent: '#f43f5e' },
  MEDIUM: { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.35)', text: '#facc15', label: 'Use Caution', glow: 'rgba(234,179,8,0.12)', accent: '#eab308' },
  LOW: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)', text: '#34d399', label: 'Likely Safe', glow: 'rgba(16,185,129,0.12)', accent: '#10b981' },
  UNKNOWN: { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.2)', text: '#94a3b8', label: 'Unable to Verify', glow: 'rgba(148,163,184,0.08)', accent: '#64748b' },
};

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

function UploadIcon({ size = 22, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 8l-5-5-5 5" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 3v12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function ImageIcon({ size = 20, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 3h14v14H3V3z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={7} cy={7} r={1.5} stroke={color} strokeWidth={1.4} />
      <Path d="M3 14l4-4 3 3 3-3 4 4" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
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

function PaperclipIcon({ size = 16, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10.5 4.5l-5 5a2.5 2.5 0 003.54 3.54l5-5a4 4 0 10-5.66-5.66l-5 5"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckIcon({ size = 12, color = '#10b981' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M2 6l3 3 5-6" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ChevronIcon({ size = 14, color = '#64748b', up = false }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d={up ? 'M3 9l4-4 4 4' : 'M3 5l4 4 4-4'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SenderIcon({ size = 14, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M14.5 2.5L7 10" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14.5 2.5l-4.5 12-3-5-5-3 12.5-4z" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
    </Svg>
  );
}

function StepBar({ step }) {
  return (
    <View className="flex-row items-center px-4 py-4 gap-2">
      {[1, 2].map((s) => {
        const isCompleted = s < step;
        const isActive = s === step;
        return (
          <View key={s} className="flex-row items-center gap-2 flex-1">
            <View
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{
                backgroundColor: isCompleted
                  ? '#4f46e5'
                  : isActive
                  ? 'rgba(79,70,229,0.15)'
                  : 'rgba(148,163,184,0.06)',
                borderWidth: isActive ? 1.5 : 0,
                borderColor: isActive ? 'rgba(129,140,248,0.6)' : 'transparent',
              }}
            >
              {isCompleted ? (
                <CheckIcon size={13} color="#c7d2fe" />
              ) : (
                <Text
                  style={{
                    color: isActive ? '#a5b4fc' : '#475569',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {s}
                </Text>
              )}
            </View>
            {s < 2 && (
              <View
                className="flex-1 h-px"
                style={{
                  backgroundColor: s < step ? '#4f46e5' : 'rgba(148,163,184,0.08)',
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Layer 1 instant risk banner + explanation bullet list. */
function ScamRiskBanner({ analyzing, analysis, error }) {
  if (analyzing && !analysis) {
    return (
      <View
        className="flex-row items-center gap-3 px-4 py-3 rounded-2xl"
        style={{
          backgroundColor: 'rgba(79,70,229,0.06)',
          borderWidth: 1,
          borderColor: 'rgba(79,70,229,0.15)',
        }}
      >
        <ActivityIndicator size="small" color="#818cf8" />
        <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '500' }}>
          Scanning for scam indicators…
        </Text>
      </View>
    );
  }

  if (!analysis) {
    if (error) {
      return (
        <View
          className="px-4 py-3 rounded-2xl"
          style={{
            backgroundColor: 'rgba(148,163,184,0.04)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.08)',
          }}
        >
          <Text style={{ color: '#475569', fontSize: 11, lineHeight: 16 }}>
            AI pre-check unavailable right now — you can still submit for officer review.
          </Text>
        </View>
      );
    }
    return null;
  }

  const risk = RISK_STYLES[analysis.riskLevel] || RISK_STYLES.UNKNOWN;
  const pct = analysis.confidenceScore != null ? Math.round(analysis.confidenceScore * 100) : null;

  return (
    <View style={{ gap: 10 }}>
      {/* Risk level banner */}
      <View
        className="flex-row items-center gap-3 px-4 py-3.5 rounded-2xl"
        style={{
          backgroundColor: risk.bg,
          borderWidth: 1,
          borderColor: risk.border,
        }}
      >
        <View
          className="w-9 h-9 rounded-xl items-center justify-center"
          style={{ backgroundColor: risk.glow }}
        >
          <Text style={{ fontSize: 16 }}>
            {analysis.isScam ? '⚠️' : analysis.riskLevel === 'LOW' ? '✓' : 'ℹ️'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: risk.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }}>
            {analysis.isScam ? 'Likely Scam' : risk.label}
            {pct != null ? ` — ${pct}% AI Confidence` : ''}
          </Text>
          {analyzing && (
            <Text style={{ color: '#64748b', fontSize: 10, marginTop: 2, fontWeight: '500' }}>
              Updating…
            </Text>
          )}
        </View>
      </View>

      {/* Explanation reasons */}
      {analysis.explanationReasons?.length > 0 && (
        <View
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(30,41,59,0.6)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.08)',
          }}
        >
          <View
            className="px-4 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.06)' }}
          >
            <Text
              style={{
                color: '#94a3b8',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.2,
              }}
            >
              WHY THIS MESSAGE WAS FLAGGED
            </Text>
          </View>
          <View className="px-4 py-3" style={{ gap: 10 }}>
            {analysis.explanationReasons.map((reason, i) => (
              <View key={i} className="flex-row items-start gap-3">
                <View
                  className="w-5 h-5 rounded-md items-center justify-center mt-0.5"
                  style={{ backgroundColor: 'rgba(79,70,229,0.12)' }}
                >
                  <Text style={{ color: '#818cf8', fontSize: 9, fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: '#e2e8f0',
                      fontSize: 12,
                      fontWeight: '600',
                      marginBottom: 2,
                      letterSpacing: 0.2,
                    }}
                  >
                    {reason.category}
                  </Text>
                  <Text style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                    {reason.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

export default function ReportScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const [step, setStep] = useState(route.params?.openStep === 3 ? 2 : 1);

  // Inputs
  const [senderNumber, setSenderNumber] = useState('');
  const [content, setContent] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [ocrText, setOcrText] = useState('');

  // Extra evidence (optional) — files only, no voice
  const [files, setFiles] = useState([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  // Location / ZKP / submission
  const [location, setLocation] = useState(null);
  const [nullifier, setNullifier] = useState(null);
  const [zkpHash, setZkpHash] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState(null);

  // Layer 1 AI analysis
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const analyzeTimerRef = useRef(null);
  const analyzeReqIdRef = useRef(0);

  const hasScreenshot = !!screenshot;
  const hasTypedText = content.trim().length > 0;
  const screenshotDisabled = hasTypedText;
  const textDisabled = hasScreenshot;

  const activeAnalysisText = hasScreenshot ? (ocrText || '').trim() : content.trim();

  const canProceedStep1 =
    (hasScreenshot && (ocrText || screenshot?.uri)) || content.trim().length > 3;

  // Camera-only quick-launch shortcut (mic shortcut removed)
  useEffect(() => {
    if (route.params?.focus === 'camera') pickScreenshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);

    const trimmed = activeAnalysisText;
    if (!trimmed || trimmed.length < MIN_ANALYZE_CHARS) {
      setAnalysis(null);
      setAnalyzeError(null);
      setAnalyzing(false);
      return;
    }

    setAnalyzing(true);
    analyzeTimerRef.current = setTimeout(
      () => runAnalysis(trimmed, hasScreenshot ? screenshot?.uri : undefined),
      ANALYZE_DEBOUNCE_MS
    );

    return () => clearTimeout(analyzeTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnalysisText, hasScreenshot]);

  const runAnalysis = async (text, imageBase64) => {
    // ... [keep unchanged]
    const reqId = ++analyzeReqIdRef.current;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await api.post('/api/v1/reports/analyze', {
        text: text || undefined,
        imageBase64: imageBase64 || undefined,
      });
      if (reqId !== analyzeReqIdRef.current) return;
      const data = response.data;

      if (data?.available === false) {
        setAnalysis(null);
        setAnalyzeError(data.error || 'ai_unavailable');
        return;
      }

      setAnalysis({
        isScam: data.isScam ?? data.is_scam,
        confidenceScore: data.confidenceScore ?? data.confidence_score,
        riskLevel: data.riskLevel ?? data.risk_level,
        explanationReasons: data.explanationReasons ?? data.explanation_reasons ?? [],
      });
    } catch (err) {
      if (reqId !== analyzeReqIdRef.current) return;
      setAnalysis(null);
      setAnalyzeError(err?.message || 'analysis_failed');
    } finally {
      if (reqId === analyzeReqIdRef.current) setAnalyzing(false);
    }
  };


  // ─── Screenshot (Option A) ────────────────────────────────────────────
  const pickScreenshot = async () => {
    if (textDisabled) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled) {
      const a = result.assets[0];
      const picked = {
        uri: a.uri,
        name: a.fileName || a.uri.split('/').pop() || 'screenshot.jpg',
        type: a.mimeType || 'image/jpeg',
      };
      setScreenshot(picked);
      // OCR text is populated by the backend response (or left blank until analyzed).
      // We optimistically clear stale OCR when a new image is attached.
      setOcrText('');
      // Kick off analysis immediately for the new screenshot.
      runAnalysis('', picked.uri);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    setOcrText('');
    setAnalysis(null);
    setAnalyzeError(null);
  };

  // ─── Extra evidence (optional files) ──────────────────────────────────
  const pickExtraFiles = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) {
      const picked = result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName || a.uri.split('/').pop() || 'evidence',
        type: a.mimeType || 'application/octet-stream',
      }));
      setFiles((prev) => [...prev, ...picked]);
    }
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));


   const toggleEvidence = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEvidenceOpen((v) => !v);
  };

  const goToStep2 = async () => {
    // ... [keep unchanged]
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
    const primaryContent = hasScreenshot ? ocrText || '[screenshot attached]' : content;
    const [nf, zh] = await Promise.all([
      generateNullifier(primaryContent),
      generateZkpCommitment({ content: primaryContent, senderNumber, timestamp }),
    ]);
    setNullifier(nf);
    setZkpHash(zh);
    setStep(2);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const localId = Crypto.randomUUID();
    const primaryContent = hasScreenshot ? ocrText || '[screenshot attached]' : content;

    const finalNullifier = nullifier || (await generateNullifier(primaryContent));
    const finalZkp =
      zkpHash ||
      (await generateZkpCommitment({
        content: primaryContent,
        senderNumber,
        timestamp: new Date().toISOString(),
      }));

    // Evidence payload: screenshot (if any) + extra files — voice note removed
    const evidenceUris = [
      ...(screenshot ? [screenshot.uri] : []),
      ...files.map((f) => f.uri),
    ];

    const payload = {
      localId,
      senderNumber: senderNumber || undefined,
      content: primaryContent,
      evidenceFiles: evidenceUris,
      latitude: location?.latitude,
      longitude: location?.longitude,
      nullifier: finalNullifier,
      zkpHash: finalZkp,
      aiRiskLevel: analysis?.riskLevel,
      aiConfidenceScore: analysis?.confidenceScore,
    };

    try {
      const response = await api.post('/api/v1/reports', {
        senderNumber: senderNumber || undefined,
        content: primaryContent,
        evidenceFiles: evidenceUris,
        location: location ? { latitude: location.latitude, longitude: location.longitude } : undefined,
        nullifier: finalNullifier,
        zkpHash: finalZkp,
        aiRiskLevel: analysis?.riskLevel,
        aiConfidenceScore: analysis?.confidenceScore,
      });
      setReportId(response.data?.reportId || response.data?.id);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof OfflineError) {
        await enqueueReport(payload);
        setReportId(`LOCAL-${localId.slice(0, 8).toUpperCase()}`);
        setSubmitted(true);
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
            className="w-20 h-20 rounded-3xl items-center justify-center mb-6"
            style={{
              backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 1.5,
              borderColor: 'rgba(16,185,129,0.25)',
            }}
          >
            <Text style={{ fontSize: 32, color: '#10b981' }}>✓</Text>
          </View>
          <Text
            style={{
              color: '#f1f5f9',
              fontSize: 18,
              fontWeight: '700',
              marginBottom: 6,
              letterSpacing: 0.3,
            }}
          >
            Report Submitted
          </Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 20, fontWeight: '500' }}>
            Your identity is protected
          </Text>
          <View
            className="w-full p-4 rounded-2xl mb-5"
            style={{
              backgroundColor: 'rgba(16,185,129,0.04)',
              borderWidth: 1,
              borderColor: 'rgba(16,185,129,0.15)',
            }}
          >
            <Text
              style={{
                color: '#64748b',
                fontSize: 10,
                fontWeight: '600',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              REPORT ID
            </Text>
            <Text
              style={{
                color: '#10b981',
                fontSize: 14,
                fontFamily: 'JetBrainsMono_400Regular',
                fontWeight: '600',
              }}
            >
              {reportId}
            </Text>
          </View>
          <Text
            style={{
              color: '#475569',
              fontSize: 11,
              textAlign: 'center',
              marginBottom: 24,
              lineHeight: 17,
            }}
          >
            ZKP hash anchored to chain. You&apos;ll be notified when reviewers verify.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            className="w-full py-4 rounded-2xl items-center"
            style={{
              backgroundColor: '#4f46e5',
              shadowColor: '#4f46e5',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600', letterSpacing: 0.3 }}>
              Done
            </Text>
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
        style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.06)' }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="w-9 h-9 rounded-xl items-center justify-center"
          style={{
            backgroundColor: 'rgba(148,163,184,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.08)',
          }}
        >
          <CloseIcon />
        </TouchableOpacity>
        <View className="flex-1">
          <Text style={{ color: '#f1f5f9', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }}>
            New Report
          </Text>
          <Text style={{ color: '#475569', fontSize: 11, fontWeight: '500', marginTop: 1 }}>
            {step === 1 ? 'Describe the incident' : 'Review & submit'}
          </Text>
        </View>
        <View
          className="px-2.5 py-1 rounded-lg"
          style={{ backgroundColor: 'rgba(79,70,229,0.1)' }}
        >
          <Text
            style={{
              color: '#818cf8',
              fontSize: 11,
              fontFamily: 'JetBrainsMono_400Regular',
              fontWeight: '600',
            }}
          >
            {step}/2
          </Text>
        </View>
      </View>

      <StepBar step={step} />

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 20, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            {/* Sender identifier */}
            <Text
              style={{
                color: '#64748b',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.2,
                marginBottom: -4,
              }}
            >
              SENDER NUMBER OR HEADER <Text style={{ color: '#334155' }}>(OPTIONAL)</Text>
            </Text>
            <View
              className="flex-row items-center gap-3 px-4 rounded-2xl"
              style={{
                backgroundColor: 'rgba(30,41,59,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
                height: 52,
              }}
            >
              <SenderIcon />
              <TextInput
                value={senderNumber}
                onChangeText={setSenderNumber}
                placeholder='e.g. "+63-917-555-0192" or "GCashAlert"'
                placeholderTextColor="#334155"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  color: '#e2e8f0',
                  fontSize: 13,
                  paddingVertical: 0,
                }}
              />
            </View>

            {/* Option A: Screenshot upload */}
            <View style={{ gap: 8 }}>
              <View className="flex-row items-center justify-between">
                <Text
                  style={{
                    color: '#64748b',
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  OPTION A — SCREENSHOT
                </Text>
                {textDisabled && (
                  <View
                    className="px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: 'rgba(148,163,184,0.08)' }}
                  >
                    <Text style={{ color: '#64748b', fontSize: 9, fontWeight: '600' }}>
                      DISABLED
                    </Text>
                  </View>
                )}
              </View>

              {!hasScreenshot ? (
                <TouchableOpacity
                  onPress={pickScreenshot}
                  disabled={screenshotDisabled}
                  style={{
                    height: 120,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: screenshotDisabled
                      ? 'rgba(148,163,184,0.08)'
                      : 'rgba(79,70,229,0.3)',
                    backgroundColor: screenshotDisabled
                      ? 'rgba(30,41,59,0.25)'
                      : 'rgba(30,41,59,0.4)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: screenshotDisabled ? 0.5 : 1,
                  }}
                >
                  <View
                    className="w-12 h-12 rounded-2xl items-center justify-center"
                    style={{
                      backgroundColor: screenshotDisabled
                        ? 'rgba(148,163,184,0.06)'
                        : 'rgba(79,70,229,0.1)',
                    }}
                  >
                    <ImageIcon color={screenshotDisabled ? '#475569' : '#818cf8'} />
                  </View>
                  <Text
                    style={{
                      color: screenshotDisabled ? '#475569' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: '600',
                    }}
                  >
                    Tap to upload screenshot
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 11 }}>
                    We&apos;ll extract the text automatically
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  className="rounded-2xl overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(30,41,59,0.5)',
                    borderWidth: 1,
                    borderColor: 'rgba(79,70,229,0.2)',
                  }}
                >
                  <Image
                    source={{ uri: screenshot.uri }}
                    style={{ width: '100%', height: 180, backgroundColor: '#0a1120' }}
                    resizeMode="cover"
                  />
                  <View className="flex-row items-center gap-3 px-4 py-3">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center"
                      style={{ backgroundColor: 'rgba(79,70,229,0.12)' }}
                    >
                      <CheckIcon size={14} color="#818cf8" />
                    </View>
                    <Text
                      style={{ color: '#cbd5e1', fontSize: 12, flex: 1, fontWeight: '500' }}
                      numberOfLines={1}
                    >
                      {screenshot.name}
                    </Text>
                    <TouchableOpacity
                      onPress={removeScreenshot}
                      className="px-3 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(244,63,94,0.1)',
                        borderWidth: 1,
                        borderColor: 'rgba(244,63,94,0.2)',
                      }}
                    >
                      <Text style={{ color: '#fb7185', fontSize: 11, fontWeight: '600' }}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* OCR terminal-style snippet */}
              {hasScreenshot && (
                <View
                  className="rounded-2xl overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    borderWidth: 1,
                    borderColor: 'rgba(79,70,229,0.15)',
                  }}
                >
                  <View
                    className="flex-row items-center gap-2 px-3 py-2"
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(79,70,229,0.12)',
                      backgroundColor: 'rgba(79,70,229,0.05)',
                    }}
                  >
                    <View className="flex-row gap-1.5">
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: 'rgba(244,63,94,0.5)',
                        }}
                      />
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: 'rgba(234,179,8,0.5)',
                        }}
                      />
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: 'rgba(16,185,129,0.5)',
                        }}
                      />
                    </View>
                    <Text
                      style={{
                        color: '#64748b',
                        fontSize: 9,
                        fontFamily: 'JetBrainsMono_400Regular',
                        fontWeight: '600',
                        letterSpacing: 0.5,
                        marginLeft: 4,
                      }}
                    >
                      ocr/extracted-text
                    </Text>
                  </View>
                  <TextInput
                    value={ocrText}
                    onChangeText={setOcrText}
                    placeholder="Extracted text will appear here…"
                    placeholderTextColor="#334155"
                    multiline
                    style={{
                      padding: 12,
                      color: '#a5b4fc',
                      fontSize: 11,
                      fontFamily: 'JetBrainsMono_400Regular',
                      lineHeight: 17,
                      minHeight: 90,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>
              )}
            </View>

            {/* Option B: Typed message */}
            <View style={{ gap: 8 }}>
              <View className="flex-row items-center justify-between">
                <Text
                  style={{
                    color: '#64748b',
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  OPTION B — MESSAGE OR URL
                </Text>
                {textDisabled && (
                  <View
                    className="px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: 'rgba(148,163,184,0.08)' }}
                  >
                    <Text style={{ color: '#64748b', fontSize: 9, fontWeight: '600' }}>
                      DISABLED
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: textDisabled
                    ? 'rgba(30,41,59,0.25)'
                    : 'rgba(30,41,59,0.5)',
                  borderWidth: 1,
                  borderColor: textDisabled
                    ? 'rgba(148,163,184,0.06)'
                    : 'rgba(148,163,184,0.1)',
                  overflow: 'hidden',
                  opacity: textDisabled ? 0.5 : 1,
                }}
              >
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  editable={!textDisabled}
                  placeholder='Paste the suspicious message, number, or URL here…'
                  placeholderTextColor="#334155"
                  multiline
                  numberOfLines={4}
                  style={{
                    padding: 14,
                    color: '#e2e8f0',
                    fontSize: 13,
                    minHeight: 110,
                    textAlignVertical: 'top',
                    lineHeight: 19,
                  }}
                />
                <View
                  className="flex-row items-center justify-between px-4 py-2.5"
                  style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.06)' }}
                >
                  <Text style={{ color: '#475569', fontSize: 10, fontWeight: '500' }}>
                    {content.length}/500 chars
                  </Text>
                  <View className="flex-row items-center gap-1.5">
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        backgroundColor: '#10b981',
                      }}
                    />
                    <Text style={{ color: '#475569', fontSize: 10, fontWeight: '500' }}>
                      End-to-end encrypted
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* AI decision & reasoning */}
            <ScamRiskBanner analyzing={analyzing} analysis={analysis} error={analyzeError} />

            {/* Optional extra evidence (collapsible) */}
            <TouchableOpacity
              onPress={toggleEvidence}
              className="flex-row items-center justify-between px-4 py-3.5 rounded-2xl"
              style={{
                backgroundColor: 'rgba(30,41,59,0.4)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.08)',
              }}
            >
              <View className="flex-row items-center gap-2.5">
                <PaperclipIcon />
                <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}>
                  Add extra evidence
                </Text>
                <Text style={{ color: '#475569', fontSize: 10, fontWeight: '500' }}>
                  (optional)
                </Text>
               {files.length > 0 && (
  <View className="px-2 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
    <Text style={{ color: '#34d399', fontSize: 9, fontWeight: '700' }}>
      {files.length} ATTACHED
    </Text>
  </View>
)}
              </View>
              <ChevronIcon up={evidenceOpen} />
            </TouchableOpacity>

            {evidenceOpen && (
                <View style={{ gap: 10 }}>
                  {/* File attachments */}
                  <TouchableOpacity
                    onPress={pickExtraFiles}
                    className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl"
                    style={{
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: 'rgba(79,70,229,0.25)',
                      backgroundColor: 'rgba(30,41,59,0.3)',
                    }}
                  >
                    <PaperclipIcon color="#818cf8" />
                    <Text style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '600' }}>
                      Attach additional files
                    </Text>
                  </TouchableOpacity>

                  {files.length > 0 && (
                    <View style={{ gap: 6 }}>
                      {files.map((file, i) => (
                        <View
                          key={i}
                          className="flex-row items-center gap-3 px-4 py-2.5 rounded-xl"
                          style={{
                            backgroundColor: 'rgba(16,185,129,0.04)',
                            borderWidth: 1,
                            borderColor: 'rgba(16,185,129,0.12)',
                          }}
                        >
                          <CheckIcon size={12} />
                          <Text
                            style={{ color: '#cbd5e1', fontSize: 11, flex: 1, fontWeight: '500' }}
                            numberOfLines={1}
                          >
                            {file.name}
                          </Text>
                          <TouchableOpacity onPress={() => removeFile(i)}>
                            <Text style={{ color: '#64748b', fontSize: 11 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  <View
                    className="flex-row items-start gap-2.5 px-4 py-3 rounded-2xl"
                    style={{
                      backgroundColor: 'rgba(148,163,184,0.03)',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.06)',
                    }}
                  >
                    <ShieldIcon size={12} color="#475569" />
                    <Text style={{ color: '#475569', fontSize: 10, flex: 1, lineHeight: 15 }}>
                      Evidence is hashed client-side. Raw files never leave your device unencrypted.
                    </Text>
                  </View>
                </View>
              )}
          </>
        )}

        {step === 2 && (
          <>
            <ScamRiskBanner analyzing={analyzing} analysis={analysis} error={analyzeError} />

            {/* ZKP Commitment Card */}
            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'rgba(79,70,229,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(79,70,229,0.15)',
              }}
            >
              <View
                className="flex-row items-center gap-2.5 px-4 py-3.5"
                style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(79,70,229,0.1)' }}
              >
                <View
                  className="w-8 h-8 rounded-xl items-center justify-center"
                  style={{ backgroundColor: 'rgba(79,70,229,0.12)' }}
                >
                  <ShieldIcon size={14} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: '#a5b4fc',
                      fontSize: 12,
                      fontWeight: '700',
                      letterSpacing: 0.2,
                    }}
                  >
                    Zero-Knowledge Proof
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 10, marginTop: 1 }}>
                    Identity protected · Commitment generated
                  </Text>
                </View>
              </View>
              <View className="px-4 py-3.5">
                <Text
                  style={{
                    color: '#475569',
                    fontSize: 11,
                    marginBottom: 10,
                    lineHeight: 16,
                  }}
                >
                  A cryptographic commitment was created from your report. This proves authenticity
                  without revealing your identity.
                </Text>
                <View
                  className="p-3 rounded-xl"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    borderWidth: 1,
                    borderColor: 'rgba(79,70,229,0.12)',
                  }}
                >
                  <Text
                    style={{
                      color: '#475569',
                      fontSize: 9,
                      fontWeight: '700',
                      letterSpacing: 1,
                      marginBottom: 4,
                    }}
                  >
                    ZKP COMMITMENT HASH
                  </Text>
                  <Text
                    style={{
                      color: '#818cf8',
                      fontSize: 10,
                      fontFamily: 'JetBrainsMono_400Regular',
                      lineHeight: 15,
                    }}
                    numberOfLines={3}
                  >
                    {zkpHash}
                  </Text>
                </View>
              </View>
            </View>

            {/* Submission summary */}
            <View
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: 'rgba(30,41,59,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.08)',
              }}
            >
              <View
                className="px-4 py-3"
                style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.06)' }}
              >
                <Text
                  style={{
                    color: '#94a3b8',
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  SUBMISSION SUMMARY
                </Text>
              </View>
              <View className="px-4 py-3" style={{ gap: 12 }}>
                {[
                  {
                    label: 'Sender',
                    value: senderNumber ? senderNumber : 'Not provided',
                  },
                  {
                    label: 'Input',
                    value: hasScreenshot
                      ? 'Screenshot (OCR extracted)'
                      : 'Typed message',
                  },
                  {
                    label: 'Content',
                    value: hasScreenshot
                      ? ocrText || '[screenshot attached]'
                      : content,
                  },
                  {
                    label: 'Evidence',
                    value:
                      files.length + (screenshot ? 1 : 0) > 0
                        ? `${files.length + (screenshot ? 1 : 0)} file(s) attached`
                        : 'No evidence',
                  },
                  {
                    label: 'Location',
                    value: location
                      ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                      : 'Not shared',
                  },
                  { label: 'Identity', value: 'Anonymous (ZKP verified)' },
                ].map((row) => (
                  <View key={row.label} className="flex-row gap-4">
                    <Text
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        width: 68,
                        fontWeight: '500',
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={{
                        color: '#e2e8f0',
                        fontSize: 12,
                        flex: 1,
                        lineHeight: 17,
                      }}
                      numberOfLines={3}
                    >
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              className="flex-row items-start gap-2.5 px-4 py-3.5 rounded-2xl"
              style={{
                backgroundColor: 'rgba(16,185,129,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(16,185,129,0.08)',
              }}
            >
              <CheckIcon size={12} />
              <Text style={{ color: '#64748b', fontSize: 10, flex: 1, lineHeight: 16 }}>
                By submitting, you agree your anonymized report may be shared with DICT, NTC, and
                law enforcement partners under TLP:GREEN classification.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        className="px-4 pb-4 pt-3"
        style={{
          borderTopWidth: 1,
          borderTopColor: 'rgba(148,163,184,0.06)',
          backgroundColor: 'rgba(10,17,32,0.95)',
        }}
      >
        <View className="flex-row gap-3">
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => s - 1)}
              className="px-5 py-4 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: 'rgba(30,41,59,0.6)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
              }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={(step === 1 && !canProceedStep1) || submitting}
            onPress={() => {
              if (step === 1) goToStep2();
              else handleSubmit();
            }}
            className="flex-1 py-4 rounded-2xl items-center justify-center"
            style={{
              backgroundColor:
                step === 1 && !canProceedStep1 ? 'rgba(79,70,229,0.2)' : '#4f46e5',
              opacity: submitting ? 0.6 : 1,
              shadowColor: '#4f46e5',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: step === 1 && !canProceedStep1 ? 0 : 0.25,
              shadowRadius: 12,
              elevation: step === 1 && !canProceedStep1 ? 0 : 4,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text
                style={{
                  color: step === 1 && !canProceedStep1 ? '#64748b' : 'white',
                  fontSize: 14,
                  fontWeight: '700',
                  letterSpacing: 0.3,
                }}
              >
                {step === 1 ? 'Next — Review' : 'Submit Report'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}