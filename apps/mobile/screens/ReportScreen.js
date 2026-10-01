// apps/mobile/screens/ReportScreen.js
//
// Guided 2-step report wizard with Layer 1 instant AI warning.
// (Header comment preserved from original — omitted here for brevity
//  in the reply, but paste it back if you want. All functional behavior
//  is identical; only colors come from the theme context now.)

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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import Svg, { Path, Circle } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveRegionFromCoordinates, UNCLASSIFIED_REGION } from '../lib/regionResolver';

import api, { OfflineError } from '../lib/api';
import { enqueueReport } from '../db/sqlite';
import { syncNow } from '../db/syncQueue';
import { generateNullifier, generateZkpCommitment } from '../lib/zkp/nullifierGenerator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../config/firebase';
import { getSubtypeGuidance } from '../lib/subtypeGuidance';
import SubtypeIcon from '../components/SubtypeIcon';
import { useTheme, spacing as S } from '../theme/ThemeContext';

async function getStoredRegion() {
  try {
    return await AsyncStorage.getItem('@sentinelph_user_region');
  } catch (err) {
    console.warn('[ReportScreen] failed to read stored region:', err?.message);
    return null;
  }
}

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ANALYZE_DEBOUNCE_MS = 700;
const MIN_ANALYZE_CHARS = 8;
const DEFAULT_SCAM_TYPE = 'UNKNOWN';

const SUBTYPE_HAS_GUIDANCE = new Set([
  'personal_conversational',
  'two_factor_auth',
  'appointment_reminder',
  'delivery_tracking',
  'bank_activity_alert',
  'brand_marketing',
  'phishing_link',
  'fake_prize_lottery',
]);

const DEFAULT_SHARE_IDENTITY = false;

function riskStyles(theme) {
  return {
    HIGH: {
      bg: theme.roseTint,
      border: theme.roseTintBorder,
      text: theme.rose,
      label: 'Likely Scam',
      glow: 'rgba(244,63,94,0.12)',
      accent: theme.rose,
    },
    MEDIUM: {
      bg: 'rgba(234,179,8,0.08)',
      border: 'rgba(234,179,8,0.35)',
      text: theme.amber,
      label: 'Use Caution',
      glow: 'rgba(234,179,8,0.12)',
      accent: theme.amber,
    },
    LOW: {
      bg: 'rgba(16,185,129,0.08)',
      border: 'rgba(16,185,129,0.35)',
      text: theme.emerald,
      label: 'Likely Safe',
      glow: 'rgba(16,185,129,0.12)',
      accent: theme.emerald,
    },
    UNKNOWN: {
      bg: 'rgba(148,163,184,0.06)',
      border: 'rgba(148,163,184,0.2)',
      text: theme.textDim,
      label: 'Unable to Verify',
      glow: 'rgba(148,163,184,0.08)',
      accent: theme.textMuted,
    },
  };
}

function CloseIcon({ color = '#94a3b8' }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Path d="M1 1l12 12M13 1L1 13" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
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

function ImageIcon({ size = 20, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 3h14v14H3V3z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={7} cy={7} r={1.5} stroke={color} strokeWidth={1.4} />
      <Path d="M3 14l4-4 3 3 3-3 4 4" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
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

function StepBar({ step, theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: S.lg,
        paddingVertical: S.lg,
        gap: S.sm,
      }}
    >
      {[1, 2].map((s) => {
        const isCompleted = s < step;
        const isActive = s === step;
        return (
          <View
            key={s}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: S.sm,
              flex: 1,
            }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isCompleted
                  ? theme.primary
                  : isActive
                  ? theme.primaryTint
                  : theme.surfaceMuted,
                borderWidth: isActive ? 1.5 : 0,
                borderColor: isActive ? theme.primaryTintBorder : 'transparent',
              }}
            >
              {isCompleted ? (
                <CheckIcon size={14} color="#ffffff" />
              ) : (
                <Text
                  style={{
                    color: isActive ? theme.primarySoft : theme.textFaint,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {s}
                </Text>
              )}
            </View>
            {s < 2 && (
              <View
                style={{
                  flex: 1,
                  height: 1,
                  backgroundColor: s < step ? theme.primary : theme.borderSoft,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

function ScamRiskBanner({ analyzing, analysis, error, theme }) {
  const RISK_STYLES = riskStyles(theme);
  if (analyzing && !analysis) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: S.md,
          paddingHorizontal: S.lg,
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: theme.primaryFaint,
          borderWidth: 1,
          borderColor: theme.primaryTintBorder,
        }}
      >
        <ActivityIndicator size="small" color={theme.primarySoft} />
        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '500' }}>
          Scanning for scam indicators…
        </Text>
      </View>
    );
  }

  if (!analysis) {
    if (error) {
      return (
        <View
          style={{
            paddingHorizontal: S.lg,
            paddingVertical: 14,
            borderRadius: 16,
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.borderSoft,
          }}
        >
          <Text style={{ color: theme.textFaint, fontSize: 12, lineHeight: 17 }}>
            AI pre-check unavailable right now — you can still submit for officer review.
          </Text>
        </View>
      );
    }
    return null;
  }

  const risk = RISK_STYLES[analysis.riskLevel] || RISK_STYLES.UNKNOWN;
  const pct = analysis.confidenceScore != null ? Math.round(analysis.confidenceScore * 100) : null;

  const subtypeGuidance = getSubtypeGuidance(analysis.subtype);
  const hasSubtype = Boolean(
    analysis.subtype && SUBTYPE_HAS_GUIDANCE.has(analysis.subtype)
  );

  return (
    <View style={{ gap: S.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: S.md,
          paddingHorizontal: S.lg,
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: risk.bg,
          borderWidth: 1,
          borderColor: risk.border,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: risk.glow,
          }}
        >
          <SubtypeIcon subtype={analysis.subtype} size={22} color={risk.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: risk.text,
              fontSize: 14,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
            numberOfLines={2}
          >
            {hasSubtype
              ? subtypeGuidance.title
              : analysis.isScam
              ? 'Likely Scam'
              : risk.label}
            {pct != null ? ` — ${pct}% AI Confidence` : ''}
          </Text>
          {analyzing && (
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 10,
                marginTop: 2,
                fontWeight: '500',
              }}
            >
              Updating…
            </Text>
          )}
        </View>
      </View>

      {hasSubtype && (
        <View
          style={{
            borderRadius: 16,
            paddingHorizontal: S.lg,
            paddingVertical: 14,
            gap: S.sm,
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.borderSoft,
          }}
        >
          <Text style={{ color: theme.textDim, fontSize: 12, lineHeight: 18 }}>
            {subtypeGuidance.body}
          </Text>
          {subtypeGuidance.actions.length > 0 && (
            <View style={{ gap: 6, marginTop: 2 }}>
              {subtypeGuidance.actions.map((action, i) => (
                <View
                  key={i}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: S.sm }}
                >
                  <Text style={{ color: risk.accent, fontSize: 12, marginTop: 1 }}>•</Text>
                  <Text style={{ color: theme.text, fontSize: 12, flex: 1, lineHeight: 17 }}>
                    {action}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {analysis.explanationReasons?.length > 0 && (
        <View
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.borderSoft,
          }}
        >
          <View
            style={{
              paddingHorizontal: S.lg,
              paddingVertical: S.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.borderSoft,
            }}
          >
            <Text
              style={{
                color: theme.textDim,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.2,
              }}
            >
              WHY THIS MESSAGE WAS FLAGGED
            </Text>
          </View>
          <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.md }}>
            {analysis.explanationReasons.map((reason, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: S.md,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 7,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                    backgroundColor: theme.primaryTint,
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: theme.primarySoft, fontSize: 10, fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 12,
                      fontWeight: '600',
                      marginBottom: 2,
                      letterSpacing: 0.2,
                    }}
                  >
                    {reason.category}
                  </Text>
                  <Text style={{ color: theme.textDim, fontSize: 11, lineHeight: 16 }}>
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
  const { width } = useWindowDimensions();
  const isWide = width >= 480;
  const { theme } = useTheme();

  const [step, setStep] = useState(route.params?.openStep === 3 ? 2 : 1);

  const [senderNumber, setSenderNumber] = useState('');
  const [content, setContent] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [ocrText, setOcrText] = useState('');
  const ocrEditedByUserRef = useRef(false);

  const [files, setFiles] = useState([]);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const [location, setLocation] = useState(null);
  const [nullifier, setNullifier] = useState(null);
  const [zkpHash, setZkpHash] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reportId, setReportId] = useState(null);

  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const analyzeTimerRef = useRef(null);
  const analyzeReqIdRef = useRef(0);

  const [shareIdentity, setShareIdentity] = useState(DEFAULT_SHARE_IDENTITY);
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');

  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      if (u.displayName && !reporterName) setReporterName(u.displayName);
      if (u.email && !reporterEmail) setReporterEmail(u.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 2) {
      setNullifier(null);
      setZkpHash(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, ocrText, senderNumber]);

  const hasScreenshot = !!screenshot;
  const hasTypedText = content.trim().length > 0;
  const screenshotDisabled = hasTypedText;
  const textDisabled = hasScreenshot;

  const activeAnalysisText = hasScreenshot ? (ocrText || '').trim() : content.trim();

  const hasSender = senderNumber.trim().length > 0;
  const hasReportBody =
    (hasScreenshot && (ocrText || screenshot?.uri)) || content.trim().length > 3;
  const canProceedStep1 = hasSender && hasReportBody;

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

  const readImageAsBase64 = async (uri) => {
    if (!uri) return undefined;
    try {
      return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    } catch (err) {
      console.warn('[ReportScreen] failed to read screenshot as base64:', err?.message);
      return undefined;
    }
  };

  const runAnalysis = async (text, imageUri) => {
    const reqId = ++analyzeReqIdRef.current;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      console.log('[debug] runAnalysis called with:');
      console.log('[debug]   text:', text);
      console.log('[debug]   imageUri:', imageUri);

      const imageBase64 = imageUri ? await readImageAsBase64(imageUri) : undefined;

      console.log('[debug] imageBase64 length:', imageBase64 ? imageBase64.length : 0);
      console.log('[debug] imageBase64 first 50 chars:', imageBase64 ? imageBase64.slice(0, 50) : 'N/A');

      const response = await api.post('/api/v1/reports/analyze', {
        text: text || undefined,
        imageBase64,
      });

      console.log('[debug] analyze HTTP status:', response.status);

      if (reqId !== analyzeReqIdRef.current) return;
      const data = response.data;

      console.log('[debug] analyze response body:', JSON.stringify(data).slice(0, 1000));

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
        subtype: data.subtype ?? null,
        subtypeConfidence: data.subtypeConfidence ?? data.subtype_confidence ?? null,
        subtypeModelVersion: data.subtypeModelVersion ?? data.subtype_model_version ?? null,
        label: data.label ?? null,
      });

      const extractedOcrText = data.ocrText ?? data.ocr_text;
      if (
        imageUri &&
        typeof extractedOcrText === 'string' &&
        !ocrEditedByUserRef.current
      ) {
        setOcrText(extractedOcrText);
      }
    } catch (err) {
      if (reqId !== analyzeReqIdRef.current) return;
      setAnalysis(null);
      setAnalyzeError(err?.message || 'analysis_failed');
    } finally {
      if (reqId === analyzeReqIdRef.current) setAnalyzing(false);
    }
  };

  const handleOcrTextChange = (value) => {
    ocrEditedByUserRef.current = true;
    setOcrText(value);
  };

  const pickScreenshot = async () => {
    if (textDisabled) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach a screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
      ocrEditedByUserRef.current = false;
      setOcrText('');
      runAnalysis('', picked.uri);
    }
  };

  const removeScreenshot = () => {
    setScreenshot(null);
    ocrEditedByUserRef.current = false;
    setOcrText('');
    setAnalysis(null);
    setAnalyzeError(null);
  };

  const pickExtraFiles = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach evidence.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
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
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        const region = resolveRegionFromCoordinates(latitude, longitude);
        console.log('[ReportScreen] GPS resolved:', { latitude, longitude, region });
        setLocation({ latitude, longitude, region });
      } else {
        console.warn(
          '[ReportScreen] location permission denied — region will fall back to stored/manual value'
        );
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

    let evidenceImage = null;
    if (screenshot?.uri) {
      try {
        const base64 = await FileSystem.readAsStringAsync(screenshot.uri, {
          encoding: 'base64',
        });
        const mime = screenshot.type || 'image/jpeg';
        evidenceImage = `data:${mime};base64,${base64}`;
      } catch (err) {
        console.warn('[ReportScreen] could not read screenshot as base64:', err?.message);
      }
    }

    const evidenceUris = [
      ...(screenshot ? [screenshot.uri] : []),
      ...files.map((f) => f.uri),
    ];

    const storedRegion = await getStoredRegion();
    const resolvedRegion =
      location?.region || storedRegion || UNCLASSIFIED_REGION;

    const locationPayload = {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      region: resolvedRegion,
    };

    console.log('[ReportScreen] submit location:', {
      hasGps: !!location,
      gpsRegion: location?.region,
      storedRegion,
      resolvedRegion,
      locationPayload,
    });

    const aiSubtype = analysis?.subtype || null;
    const aiSubtypeConfidence =
      typeof analysis?.subtypeConfidence === 'number'
        ? analysis.subtypeConfidence
        : null;
    const aiSubtypeModelVersion = analysis?.subtypeModelVersion || null;
    const aiExplanationReasons = Array.isArray(analysis?.explanationReasons)
      ? analysis.explanationReasons
      : [];
    const aiLabel = analysis?.label || null;

    const payload = {
      localId,
      scamType: DEFAULT_SCAM_TYPE,
      senderNumber: senderNumber || undefined,
      content: primaryContent,
      evidenceFiles: evidenceUris,
      evidenceImage,
      location: locationPayload,
      region: resolvedRegion,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      nullifier: finalNullifier,
      zkpHash: finalZkp,
      aiRiskLevel: analysis?.riskLevel,
      aiConfidenceScore: analysis?.confidenceScore,
      aiSubtype,
      aiSubtypeConfidence,
      aiSubtypeModelVersion,
      aiExplanationReasons,
      aiLabel,
      reporterShared: shareIdentity,
      reporterName: shareIdentity ? (reporterName.trim() || null) : null,
      reporterEmail: shareIdentity ? (reporterEmail.trim().toLowerCase() || null) : null,
    };

    try {
      const response = await api.post('/api/v1/reports', {
        scamType: DEFAULT_SCAM_TYPE,
        senderNumber: senderNumber || undefined,
        content: primaryContent,
        evidenceFiles: evidenceUris,
        evidenceImage,
        location: locationPayload,
        region: resolvedRegion,
        nullifier: finalNullifier,
        zkpHash: finalZkp,
        aiRiskLevel: analysis?.riskLevel,
        aiConfidenceScore: analysis?.confidenceScore,
        reporterShared: shareIdentity,
        reporterName: shareIdentity ? (reporterName.trim() || null) : null,
        reporterEmail: shareIdentity ? (reporterEmail.trim().toLowerCase() || null) : null,
      });

      const serverReportId =
        response.data?.reportId || response.data?.id || null;

      try {
        await enqueueReport({
          ...payload,
          serverReportId: serverReportId || undefined,
        });
        console.log('[ReportScreen] enqueued locally after 201');
      } catch (enqueueErr) {
        console.warn(
          '[ReportScreen] enqueue after 201 failed:',
          enqueueErr?.message
        );
      }

      setReportId(serverReportId);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof OfflineError) {
        await enqueueReport(payload);
        setReportId(`LOCAL-${localId.slice(0, 8).toUpperCase()}`);
        setSubmitted(true);
        syncNow().catch(() => {});
      } else if (err?.response?.status === 409) {
        const existingId = err.response.data?.existingReportId || undefined;
        try {
          await enqueueReport({ ...payload, serverReportId: existingId });
          console.log('[ReportScreen] enqueued locally after 409');
        } catch (enqueueErr) {
          console.warn(
            '[ReportScreen] enqueue after 409 failed:',
            enqueueErr?.message
          );
        }
        setReportId(
          existingId || `LOCAL-${localId.slice(0, 8).toUpperCase()}`
        );
        setSubmitted(true);
        Alert.alert(
          'Report already submitted',
          'This exact message was already sent to the server. You can view it in My Reports.'
        );
      } else {
        Alert.alert('Submission failed', err?.message || 'Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Success screen ──────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: S.xl,
          }}
        >
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: S.xl,
              backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 1.5,
              borderColor: 'rgba(16,185,129,0.25)',
            }}
          >
            <CheckIcon size={36} color={theme.emerald} />
          </View>
          <Text
            style={{
              color: theme.text,
              fontSize: 20,
              fontWeight: '700',
              marginBottom: 8,
              letterSpacing: 0.2,
              textAlign: 'center',
            }}
          >
            Report Submitted
          </Text>
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 13,
              marginBottom: 24,
              fontWeight: '500',
              textAlign: 'center',
            }}
          >
            Your identity is protected
          </Text>
          <View
            style={{
              width: '100%',
              maxWidth: 420,
              padding: 18,
              borderRadius: 18,
              marginBottom: 24,
              backgroundColor: 'rgba(16,185,129,0.04)',
              borderWidth: 1,
              borderColor: 'rgba(16,185,129,0.15)',
            }}
          >
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1,
                marginBottom: 6,
              }}
            >
              REPORT ID
            </Text>
            <Text
              style={{
                color: theme.emerald,
                fontSize: 15,
                fontFamily: 'JetBrainsMono_400Regular',
                fontWeight: '600',
              }}
              numberOfLines={1}
            >
              {reportId}
            </Text>
          </View>
          <Text
            style={{
              color: theme.textFaint,
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 28,
              lineHeight: 18,
              maxWidth: 320,
            }}
          >
            ZKP hash anchored to chain. You&apos;ll be notified when reviewers verify.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Home')}
            style={{
              width: '100%',
              maxWidth: 420,
              paddingVertical: 16,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor: theme.primary,
              shadowColor: theme.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 15,
                fontWeight: '700',
                letterSpacing: 0.3,
              }}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: S.md,
          paddingHorizontal: S.lg,
          paddingTop: S.sm,
          paddingBottom: S.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderSoft,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.borderSoft,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CloseIcon color={theme.textDim} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: theme.text,
              fontSize: 16,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            New Report
          </Text>
          <Text
            style={{
              color: theme.textFaint,
              fontSize: 11,
              fontWeight: '500',
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {step === 1 ? 'Describe the incident' : 'Review & submit'}
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: theme.primaryTint,
          }}
        >
          <Text
            style={{
              color: theme.primarySoft,
              fontSize: 11,
              fontFamily: 'JetBrainsMono_400Regular',
              fontWeight: '700',
            }}
          >
            {step}/2
          </Text>
        </View>
      </View>

      <StepBar step={step} theme={theme} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.lg,
          paddingBottom: S.xl,
          gap: S.md,
          maxWidth: isWide ? 720 : undefined,
          alignSelf: isWide ? 'center' : 'stretch',
          width: '100%',
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            {/* Sender identifier */}
            <Text
              style={{
                color: theme.textDim,
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.2,
                marginTop: S.sm,
              }}
            >
              SENDER NUMBER OR HEADER{' '}
              <Text style={{ color: theme.rose }}>(REQUIRED)</Text>
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: S.md,
                paddingHorizontal: S.lg,
                borderRadius: 16,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                minHeight: 54,
              }}
            >
              <SenderIcon color={theme.primarySoft} />
              <TextInput
                value={senderNumber}
                onChangeText={setSenderNumber}
                placeholder='e.g. "+63-917-555-0192" or "GCashAlert"'
                placeholderTextColor={theme.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  color: theme.text,
                  fontSize: 14,
                  paddingVertical: 14,
                }}
              />
            </View>

            {/* Option A: Screenshot upload */}
            <View style={{ gap: S.sm, marginTop: S.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    color: theme.textDim,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  OPTION A — SCREENSHOT
                </Text>
                {textDisabled && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
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
                    minHeight: 130,
                    borderRadius: 20,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: screenshotDisabled
                      ? theme.borderSoft
                      : theme.primaryTintBorder,
                    backgroundColor: screenshotDisabled
                      ? theme.surfaceMuted
                      : theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 24,
                    paddingHorizontal: 20,
                    gap: 10,
                    opacity: screenshotDisabled ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: screenshotDisabled
                        ? theme.surfaceMuted
                        : theme.primaryTint,
                    }}
                  >
                    <ImageIcon color={screenshotDisabled ? theme.textFaint : theme.primarySoft} />
                  </View>
                  <Text
                    style={{
                      color: screenshotDisabled ? theme.textFaint : theme.textDim,
                      fontSize: 13,
                      fontWeight: '600',
                      textAlign: 'center',
                    }}
                  >
                    Tap to upload screenshot
                  </Text>
                  <Text
                    style={{
                      color: theme.textFaint,
                      fontSize: 11,
                      textAlign: 'center',
                    }}
                  >
                    We&apos;ll extract the text automatically
                  </Text>
                </TouchableOpacity>
              ) : (
                <View
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.primaryTintBorder,
                  }}
                >
                  <Image
                    source={{ uri: screenshot.uri }}
                    style={{ width: '100%', height: 180, backgroundColor: '#000' }}
                    resizeMode="cover"
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: S.md,
                      paddingHorizontal: S.lg,
                      paddingVertical: S.md,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.primaryTint,
                        flexShrink: 0,
                      }}
                    >
                      <CheckIcon size={14} color={theme.primarySoft} />
                    </View>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 12,
                        flex: 1,
                        fontWeight: '600',
                      }}
                      numberOfLines={1}
                    >
                      {screenshot.name}
                    </Text>
                    <TouchableOpacity
                      onPress={removeScreenshot}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: theme.roseTint,
                        borderWidth: 1,
                        borderColor: theme.roseTintBorder,
                      }}
                    >
                      <Text style={{ color: theme.rose, fontSize: 11, fontWeight: '700' }}>
                        Remove
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* OCR terminal-style snippet */}
              {hasScreenshot && (
                <View
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: theme.surfaceAlt,
                    borderWidth: 1,
                    borderColor: theme.primaryTintBorder,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: S.sm,
                      paddingHorizontal: S.md,
                      paddingVertical: S.sm,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.borderSoft,
                      backgroundColor: theme.primaryFaint,
                    }}
                  >
                    <View style={{ flexDirection: 'row', gap: 6 }}>
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
                        color: theme.textMuted,
                        fontSize: 9,
                        fontFamily: 'JetBrainsMono_400Regular',
                        fontWeight: '600',
                        letterSpacing: 0.5,
                        marginLeft: 4,
                      }}
                    >
                      ocr/extracted-text
                    </Text>
                    {analyzing && (
                      <ActivityIndicator
                        size="small"
                        color={theme.primarySoft}
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </View>
                  <TextInput
                    value={ocrText}
                    onChangeText={handleOcrTextChange}
                    placeholder={
                      analyzing
                        ? 'Extracting text from screenshot…'
                        : 'Extracted text will appear here…'
                    }
                    placeholderTextColor={theme.textFaint}
                    multiline
                    style={{
                      padding: S.md,
                      color: theme.primarySoft,
                      fontSize: 12,
                      fontFamily: 'JetBrainsMono_400Regular',
                      lineHeight: 18,
                      minHeight: 90,
                      textAlignVertical: 'top',
                    }}
                  />
                </View>
              )}
            </View>

            {/* Option B: Typed message */}
            <View style={{ gap: S.sm, marginTop: S.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    color: theme.textDim,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  OPTION B — MESSAGE OR URL
                </Text>
                {textDisabled && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                      DISABLED
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  borderRadius: 16,
                  backgroundColor: textDisabled ? theme.surfaceMuted : theme.surface,
                  borderWidth: 1,
                  borderColor: textDisabled ? theme.borderSoft : theme.border,
                  overflow: 'hidden',
                  opacity: textDisabled ? 0.5 : 1,
                }}
              >
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  editable={!textDisabled}
                  placeholder="Paste the suspicious message, number, or URL here…"
                  placeholderTextColor={theme.textFaint}
                  multiline
                  numberOfLines={4}
                  style={{
                    padding: 14,
                    color: theme.text,
                    fontSize: 14,
                    minHeight: 110,
                    textAlignVertical: 'top',
                    lineHeight: 20,
                  }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: S.lg,
                    paddingVertical: S.sm,
                    borderTopWidth: 1,
                    borderTopColor: theme.borderSoft,
                  }}
                >
                  <Text style={{ color: theme.textFaint, fontSize: 10, fontWeight: '500' }}>
                    {content.length}/500 chars
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: theme.emerald,
                      }}
                    />
                    <Text style={{ color: theme.textFaint, fontSize: 10, fontWeight: '500' }}>
                      End-to-end encrypted
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <ScamRiskBanner
              analyzing={analyzing}
              analysis={analysis}
              error={analyzeError}
              theme={theme}
            />

            {/* Reporter identity */}
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setShareIdentity((v) => !v);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: S.lg,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, marginRight: S.md }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }}>
                    Share my name with reviewing officers
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 3, lineHeight: 15 }}>
                    Optional. If enabled, only the officer assigned to your region can see your name.
                  </Text>
                </View>
                <View
                  style={{
                    width: 44,
                    height: 26,
                    borderRadius: 13,
                    padding: 2,
                    backgroundColor: shareIdentity ? theme.primary : theme.surfaceMuted,
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: '#fff',
                      transform: [{ translateX: shareIdentity ? 18 : 0 }],
                    }}
                  />
                </View>
              </TouchableOpacity>

              {shareIdentity && (
                <View
                  style={{
                    paddingHorizontal: S.lg,
                    paddingBottom: 14,
                    gap: S.sm,
                    borderTopWidth: 1,
                    borderTopColor: theme.borderSoft,
                    paddingTop: S.md,
                  }}
                >
                  <TextInput
                    value={reporterName}
                    onChangeText={setReporterName}
                    placeholder="Your name (as it should appear to officers)"
                    placeholderTextColor={theme.textFaint}
                    autoCapitalize="words"
                    style={{
                      color: theme.text,
                      fontSize: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: theme.surfaceAlt,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  />
                  <TextInput
                    value={reporterEmail}
                    onChangeText={setReporterEmail}
                    placeholder="Your email (optional)"
                    placeholderTextColor={theme.textFaint}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    style={{
                      color: theme.text,
                      fontSize: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: theme.surfaceAlt,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  />
                  <Text style={{ color: theme.textFaint, fontSize: 10, lineHeight: 15 }}>
                    Only officers in your region can see this. It is not shared with the public or other citizens.
                  </Text>
                </View>
              )}
            </View>

            {/* Extra evidence */}
            <TouchableOpacity
              onPress={toggleEvidence}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: S.lg,
                paddingVertical: 14,
                borderRadius: 16,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: S.sm,
                  flexShrink: 1,
                }}
              >
                <PaperclipIcon color={theme.textDim} />
                <Text
                  style={{ color: theme.textDim, fontSize: 12, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  Add extra evidence
                </Text>
                <Text
                  style={{ color: theme.textFaint, fontSize: 10, fontWeight: '500' }}
                  numberOfLines={1}
                >
                  (optional)
                </Text>
                {files.length > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: 'rgba(16,185,129,0.15)',
                    }}
                  >
                    <Text style={{ color: theme.emerald, fontSize: 9, fontWeight: '700' }}>
                      {files.length} ATTACHED
                    </Text>
                  </View>
                )}
              </View>
              <ChevronIcon up={evidenceOpen} color={theme.textMuted} />
            </TouchableOpacity>

            {evidenceOpen && (
              <View style={{ gap: S.sm }}>
                <TouchableOpacity
                  onPress={pickExtraFiles}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: S.sm,
                    paddingVertical: 14,
                    paddingHorizontal: S.lg,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: theme.primaryTintBorder,
                    backgroundColor: theme.surfaceMuted,
                  }}
                >
                  <PaperclipIcon color={theme.primarySoft} />
                  <Text
                    style={{ color: theme.primarySoft, fontSize: 12, fontWeight: '700' }}
                    numberOfLines={1}
                  >
                    Attach additional files
                  </Text>
                </TouchableOpacity>

                {files.length > 0 && (
                  <View style={{ gap: 6 }}>
                    {files.map((file, i) => (
                      <View
                        key={i}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: S.md,
                          paddingHorizontal: S.lg,
                          paddingVertical: S.sm,
                          borderRadius: 12,
                          backgroundColor: 'rgba(16,185,129,0.04)',
                          borderWidth: 1,
                          borderColor: 'rgba(16,185,129,0.12)',
                        }}
                      >
                        <CheckIcon size={12} color={theme.emerald} />
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 11,
                            flex: 1,
                            fontWeight: '500',
                          }}
                          numberOfLines={1}
                        >
                          {file.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => removeFile(i)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={{ color: theme.textMuted, fontSize: 14 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: S.sm,
                    paddingHorizontal: S.lg,
                    paddingVertical: S.md,
                    borderRadius: 16,
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.borderSoft,
                  }}
                >
                  <ShieldIcon size={12} color={theme.textFaint} />
                  <Text
                    style={{
                      color: theme.textFaint,
                      fontSize: 10,
                      flex: 1,
                      lineHeight: 15,
                    }}
                  >
                    Evidence is hashed client-side. Raw files never leave your device unencrypted.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <ScamRiskBanner
              analyzing={analyzing}
              analysis={analysis}
              error={analyzeError}
              theme={theme}
            />

            {/* ZKP Commitment Card */}
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme.primaryFaint,
                borderWidth: 1,
                borderColor: theme.primaryTintBorder,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: S.md,
                  paddingHorizontal: S.lg,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.primaryTintBorder,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.primaryTint,
                    flexShrink: 0,
                  }}
                >
                  <ShieldIcon size={14} color={theme.primarySoft} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: theme.primarySoft,
                      fontSize: 13,
                      fontWeight: '700',
                      letterSpacing: 0.2,
                    }}
                  >
                    Zero-Knowledge Proof
                  </Text>
                  <Text
                    style={{ color: theme.textMuted, fontSize: 10, marginTop: 1 }}
                    numberOfLines={1}
                  >
                    Identity protected · Commitment generated
                  </Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: S.lg, paddingVertical: 14 }}>
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 11,
                    marginBottom: 10,
                    lineHeight: 16,
                  }}
                >
                  A cryptographic commitment was created from your report. This
                  proves authenticity without revealing your identity.
                </Text>
                <View
                  style={{
                    padding: S.md,
                    borderRadius: 12,
                    backgroundColor: theme.surfaceAlt,
                    borderWidth: 1,
                    borderColor: theme.primaryTintBorder,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textMuted,
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
                      color: theme.primarySoft,
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
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View
                style={{
                  paddingHorizontal: S.lg,
                  paddingVertical: S.md,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderSoft,
                }}
              >
                <Text
                  style={{
                    color: theme.textDim,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1.2,
                  }}
                >
                  SUBMISSION SUMMARY
                </Text>
              </View>
              <View style={{ paddingHorizontal: S.lg, paddingVertical: S.md, gap: S.md }}>
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
                  {
                    label: 'Identity',
                    value: shareIdentity
                      ? `Shared with reviewers${reporterName.trim() ? ` (${reporterName.trim()})` : ''}`
                      : 'Anonymous (ZKP verified)',
                  },
                ].map((row) => (
                  <View
                    key={row.label}
                    style={{
                      flexDirection: 'row',
                      gap: S.lg,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 11,
                        width: 72,
                        fontWeight: '500',
                        flexShrink: 0,
                      }}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 12,
                        flex: 1,
                        lineHeight: 17,
                        minWidth: 0,
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
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: S.sm,
                paddingHorizontal: S.lg,
                paddingVertical: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(16,185,129,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(16,185,129,0.08)',
              }}
            >
              <CheckIcon size={12} color={theme.emerald} />
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 10,
                  flex: 1,
                  lineHeight: 16,
                }}
              >
                By submitting, you agree your anonymized report may be shared with
                DICT, NTC, and law enforcement partners under TLP:GREEN
                classification.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          paddingHorizontal: S.lg,
          paddingBottom: S.lg,
          paddingTop: S.md,
          borderTopWidth: 1,
          borderTopColor: theme.borderSoft,
          backgroundColor: theme.bg,
        }}
      >
        <View style={{ flexDirection: 'row', gap: S.md }}>
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => s - 1)}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: '600' }}>
                Back
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            disabled={(step === 1 && !canProceedStep1) || submitting}
            onPress={() => {
              if (step === 1) goToStep2();
              else handleSubmit();
            }}
            style={{
              flex: 1,
              paddingVertical: 16,
              paddingHorizontal: S.lg,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                step === 1 && !canProceedStep1
                  ? theme.surfaceMuted
                  : theme.primary,
              opacity: submitting ? 0.6 : 1,
              shadowColor: theme.primary,
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
                  color:
                    step === 1 && !canProceedStep1 ? theme.textMuted : 'white',
                  fontSize: 14,
                  fontWeight: '700',
                  letterSpacing: 0.3,
                }}
                numberOfLines={1}
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