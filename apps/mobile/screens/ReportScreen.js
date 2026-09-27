// apps/mobile/screens/ReportScreen.js
//
// Guided 2-step report wizard with Layer 1 instant AI warning:
//   Step 1 — Report Intake & Analysis
//            · Optional sender identifier
//            · Mutually exclusive: Screenshot upload (OCR) OR typed message
//            · Debounced AI scam analysis + reasoning
//            · Optional collapsible extra evidence (files only)
//   Step 2 — Review & ZKP Verification
//            · ZKP commitment hash, full submission summary, final submit
//
// Submits live via POST /api/v1/reports when online; otherwise enqueues
// into the SQLite outbox (db/sqlite.js) for db/syncQueue.js to flush later.
// Layer 1 preview calls POST /api/v1/reports/analyze (advisory-only,
// mirrors the AI microservice's /predict — never blacklists anything).
//
// FIX (Voice-note removal): expo-av / expo-audio / useAudioRecorder and
// all associated recording state, hooks, and mic UI have been removed —
// they are not imported or referenced anywhere in this file. The 2-Step
// Intake Flow below is screenshot-OR-text only, as required.
//
// FIX (OCR not populating): the mobile app never had anywhere to put the
// extracted text — the AI service's /predict response didn't return it.
// runAnalysis now reads `ocrText` back off the analyze response and
// writes it into local state whenever the active input is a screenshot,
// so the OCR terminal panel populates automatically instead of staying
// blank until the user types into it manually.
//
// FIX (scamType NOT NULL crash): the scamType picker was removed from
// this screen entirely, so every payload built here now explicitly sets
// scamType: 'UNKNOWN' — both for the live POST and for the offline
// SQLite payload — instead of omitting the field and letting it reach
// SQLite as undefined.
//
// NEW (Reporter identity): citizens may now opt-in to sharing their name
// and email with the reviewing officer. Default is OFF (anonymous). When
// the toggle is ON, the submit payload carries reporterShared: true plus
// reporterName/reporterEmail, and the backend stores them as select:false
// fields visible only to officers. When OFF, the fields are null and the
// officer sees "Anonymous reporter".

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

// Reads the user's manually-saved region from ProfileScreen. Returns
// null if the user has never picked one — the caller falls back to
// UNCLASSIFIED_REGION in that case.
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
const DEFAULT_SCAM_TYPE = 'UNKNOWN'; // scamType picker was removed from citizen UI

// ─── REPORTER IDENTITY ────────────────────────────────────────────────
// Off by default — the citizen must opt in. The backend stores the name
// and email only when this flag is true on the submit payload.
const DEFAULT_SHARE_IDENTITY = false;
// ──────────────────────────────────────────────────────────────────────

const RISK_STYLES = {
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
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 8,
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
              gap: 8,
              flex: 1,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
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
                style={{
                  flex: 1,
                  height: 1,
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
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 16,
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
          style={{
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 16,
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: risk.bg,
          borderWidth: 1,
          borderColor: risk.border,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: risk.glow,
          }}
        >
          <Text style={{ fontSize: 16 }}>
            {analysis.isScam ? '' : analysis.riskLevel === 'LOW' ? '' : ''}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: risk.text,
              fontSize: 13,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
            numberOfLines={2}
          >
            {analysis.isScam ? 'Likely Scam' : risk.label}
            {pct != null ? ` — ${pct}% AI Confidence` : ''}
          </Text>
          {analyzing && (
            <Text
              style={{
                color: '#64748b',
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

      {analysis.explanationReasons?.length > 0 && (
        <View
          style={{
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: 'rgba(30,41,59,0.6)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.08)',
          }}
        >
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(148,163,184,0.06)',
            }}
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
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 10 }}>
            {analysis.explanationReasons.map((reason, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                    backgroundColor: 'rgba(79,70,229,0.12)',
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: '#818cf8', fontSize: 9, fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
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
  const { width } = useWindowDimensions();
  const isWide = width >= 480;

  const [step, setStep] = useState(route.params?.openStep === 3 ? 2 : 1);

  // Inputs
  const [senderNumber, setSenderNumber] = useState('');
  const [content, setContent] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [ocrText, setOcrText] = useState('');
  // Tracks whether the user has hand-edited the OCR box, so a later
  // analyze response doesn't clobber their manual correction.
  const ocrEditedByUserRef = useRef(false);

  // Extra evidence (optional) — files only, no voice/audio
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

  // ─── REPORTER IDENTITY ──────────────────────────────────────────────
  const [shareIdentity, setShareIdentity] = useState(DEFAULT_SHARE_IDENTITY);
  const [reporterName, setReporterName] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');

  // Pre-fill from the Firebase user profile so the citizen only has to
  // confirm (or edit) instead of typing.
  useEffect(() => {
    const u = auth.currentUser;
    if (u) {
      if (u.displayName && !reporterName) setReporterName(u.displayName);
      if (u.email && !reporterEmail) setReporterEmail(u.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // If the citizen edits the report content or sender after reaching
  // Step 2, the stored nullifier is stale — clear it so the next submit
  // regenerates one bound to the current content. Prevents the same
  // nullifier from being reused across genuinely different reports.
  useEffect(() => {
    if (step === 2) {
      setNullifier(null);
      setZkpHash(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, ocrText, senderNumber]);
  // ─────────────────────────────────────────────────────────────────────

  const hasScreenshot = !!screenshot;
  const hasTypedText = content.trim().length > 0;
  const screenshotDisabled = hasTypedText;
  const textDisabled = hasScreenshot;

  const activeAnalysisText = hasScreenshot ? (ocrText || '').trim() : content.trim();

  // Sender is REQUIRED (Option A). A report with no sender is nearly
  // useless to officers, so Step 1 cannot be completed without it.
  const hasSender = senderNumber.trim().length > 0;
  const hasReportBody =
    (hasScreenshot && (ocrText || screenshot?.uri)) || content.trim().length > 3;
  const canProceedStep1 = hasSender && hasReportBody;

  // Camera-only quick-launch shortcut
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

  /**
   * Converts a local image URI into a base64 string for the JSON+base64
   * pipeline shared by Express (aiServiceClient.js) and FastAPI
   * (schemas.PredictRequest.image_base64). ReportScreen already stores
   * the URI, not the bytes, so this reads the file lazily right before
   * an analyze call needs it.
   */
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
      // ─── DEBUG LOG 1: input args ─────────────────────────────────────
      console.log('[debug] runAnalysis called with:');
      console.log('[debug]   text:', text);
      console.log('[debug]   imageUri:', imageUri);

      const imageBase64 = imageUri ? await readImageAsBase64(imageUri) : undefined;

      // ─── DEBUG LOG 2: base64 read result ─────────────────────────────
      console.log('[debug] imageBase64 length:', imageBase64 ? imageBase64.length : 0);
      console.log('[debug] imageBase64 first 50 chars:', imageBase64 ? imageBase64.slice(0, 50) : 'N/A');

      const response = await api.post('/api/v1/reports/analyze', {
        text: text || undefined,
        imageBase64,
      });

      // ─── DEBUG LOG 3: HTTP response status ───────────────────────────
      console.log('[debug] analyze HTTP status:', response.status);

      if (reqId !== analyzeReqIdRef.current) return;
      const data = response.data;

      // ─── DEBUG LOG 4: full response body ─────────────────────────────
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
      });

      // FIX (OCR not populating — stale closure): the previous check used
      // the outer `hasScreenshot` state, which is captured from the render
      // that existed BEFORE setScreenshot(picked) took effect, so it was
      // always stale-false the first time this ran from pickScreenshot().
      // `imageUri` is a direct function argument, not a closure over
      // component state, so it's always correct regardless of when this
      // was called relative to a re-render.
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

  // ─── Screenshot (Option A) ────────────────────────────────────────────
  const pickScreenshot = async () => {
    if (textDisabled) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach a screenshot.');
      return;
    }
    // SDK 57: ImagePicker.MediaTypeOptions is deprecated. Use the string
    // array form, e.g. ['images'] or ['images', 'videos'].
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
      // OCR text is populated by the backend response once analysis
      // returns — clear any stale text and reset the manual-edit flag
      // for the new image.
      ocrEditedByUserRef.current = false;
      setOcrText('');
      // Kick off analysis immediately for the new screenshot.
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

  // ─── Extra evidence (optional files) ──────────────────────────────────
  const pickExtraFiles = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to attach evidence.');
      return;
    }
    // SDK 57: ImagePicker.MediaTypeOptions is deprecated. Use the string
    // array form. ['images', 'videos'] replaces MediaTypeOptions.All.
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

        // Resolve to a canonical PH region using the bundled offline
        // bounding-box lookup — no network call, no API key.
        const region = resolveRegionFromCoordinates(latitude, longitude);
        console.log('[ReportScreen] GPS resolved:', {
          latitude,
          longitude,
          region,
        });
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

    // Convert the screenshot to a base64 data-URI so the gateway can
    // (a) run OCR on final submit if needed, and (b) persist the image
    // for the officer Review Queue.
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

    // ─── Resolve the region ONCE so both online and offline payloads
    //     carry the SAME value. Priority order:
    //       1. GPS-resolved region from goToStep2 (fresh in this session)
    //       2. User's manual region from ProfileScreen (AsyncStorage)
    //       3. UNCLASSIFIED as the final fallback
    const storedRegion = await getStoredRegion();
    const resolvedRegion =
      location?.region || storedRegion || UNCLASSIFIED_REGION;

    // Build a single canonical location object. This is what the server
    // reads to populate Report.location, and what the officer queue's
    // region filter matches against.
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

    // Offline payload — enqueued to SQLite if the POST fails due to no
    // network. It carries BOTH the canonical `location` object AND a
    // top-level `region` field so syncQueue can forward either shape.
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
      // ─── REPORTER IDENTITY ────────────────────────────────────────
      reporterShared: shareIdentity,
      reporterName: shareIdentity ? (reporterName.trim() || null) : null,
      reporterEmail: shareIdentity ? (reporterEmail.trim().toLowerCase() || null) : null,
      // ─────────────────────────────────────────────────────────────
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
        // ─── REPORTER IDENTITY ────────────────────────────────────────
        reporterShared: shareIdentity,
        reporterName: shareIdentity ? (reporterName.trim() || null) : null,
        reporterEmail: shareIdentity ? (reporterEmail.trim().toLowerCase() || null) : null,
        // ─────────────────────────────────────────────────────────────
      });

      const serverReportId =
        response.data?.reportId || response.data?.id || null;

      // ─── MIRROR TO LOCAL SQLITE ON 201 SUCCESS ─────────────────────
      // My Reports and the Profile report count both read from SQLite.
      // A successful server save must also be mirrored locally, or the
      // citizen sees nothing in their own history after a Clear Cache.
      // Passing serverReportId tells enqueueReport to write the row as
      // synced=1 so syncQueue never re-POSTs it (which would duplicate
      // the nullifier and fail forever).
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
      // ────────────────────────────────────────────────────────────────

      setReportId(serverReportId);
      setSubmitted(true);
    } catch (err) {
      if (err instanceof OfflineError) {
        // No network — enqueue for later.
        await enqueueReport(payload);
        setReportId(`LOCAL-${localId.slice(0, 8).toUpperCase()}`);
        setSubmitted(true);
        syncNow().catch(() => {});
      } else if (err?.response?.status === 409) {
        // Server says: this exact report already exists. Treat as
        // success — the citizen did submit it — and enqueue locally so
        // it shows up in My Reports. Pass existingReportId so the row is
        // written as synced=1 and syncQueue never re-POSTs it.
        const existingId =
          err.response.data?.existingReportId || undefined;
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

  // ─── Success screen ───────────────────────────────────────────────────
  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0a1120' }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 24,
              backgroundColor: 'rgba(16,185,129,0.08)',
              borderWidth: 1.5,
              borderColor: 'rgba(16,185,129,0.25)',
            }}
          >
            <Text style={{ fontSize: 32, color: '#10b981' }}></Text>
          </View>
          <Text
            style={{
              color: '#f1f5f9',
              fontSize: 18,
              fontWeight: '700',
              marginBottom: 6,
              letterSpacing: 0.3,
              textAlign: 'center',
            }}
          >
            Report Submitted
          </Text>
          <Text
            style={{
              color: '#64748b',
              fontSize: 12,
              marginBottom: 20,
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
              padding: 16,
              borderRadius: 16,
              marginBottom: 20,
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
              numberOfLines={1}
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
              backgroundColor: '#4f46e5',
              shadowColor: '#4f46e5',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Text
              style={{
                color: 'white',
                fontSize: 14,
                fontWeight: '600',
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a1120' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(148,163,184,0.06)',
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(148,163,184,0.06)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.08)',
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <CloseIcon />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: '#f1f5f9',
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            New Report
          </Text>
          <Text
            style={{
              color: '#475569',
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
            backgroundColor: 'rgba(79,70,229,0.1)',
          }}
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
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 14,
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
                color: '#64748b',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 1.2,
              }}
            >
              SENDER NUMBER OR HEADER{' '}
              <Text style={{ color: '#ef4444' }}>(REQUIRED)</Text>
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                borderRadius: 16,
                backgroundColor: 'rgba(30,41,59,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
                minHeight: 52,
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
                  paddingVertical: 14,
                }}
              />
            </View>

            {/* Option A: Screenshot upload */}
            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
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
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: 'rgba(148,163,184,0.08)',
                    }}
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
                    minHeight: 120,
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
                    paddingVertical: 24,
                    paddingHorizontal: 20,
                    gap: 8,
                    opacity: screenshotDisabled ? 0.5 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
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
                      textAlign: 'center',
                    }}
                  >
                    Tap to upload screenshot
                  </Text>
                  <Text
                    style={{
                      color: '#475569',
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
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(79,70,229,0.12)',
                        flexShrink: 0,
                      }}
                    >
                      <CheckIcon size={14} color="#818cf8" />
                    </View>
                    <Text
                      style={{
                        color: '#cbd5e1',
                        fontSize: 12,
                        flex: 1,
                        fontWeight: '500',
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
                  style={{
                    borderRadius: 16,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(0,0,0,0.35)',
                    borderWidth: 1,
                    borderColor: 'rgba(79,70,229,0.15)',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: 'rgba(79,70,229,0.12)',
                      backgroundColor: 'rgba(79,70,229,0.05)',
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
                    {analyzing && (
                      <ActivityIndicator
                        size="small"
                        color="#818cf8"
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
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
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
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: 'rgba(148,163,184,0.08)',
                    }}
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
                  placeholder="Paste the suspicious message, number, or URL here…"
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
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(148,163,184,0.06)',
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 10, fontWeight: '500' }}>
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

            {/* ─── REPORTER IDENTITY ────────────────────────────────── */}
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: 'rgba(30,41,59,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
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
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                  <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '700', letterSpacing: 0.2 }}>
                    Share my name with reviewing officers
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 10, marginTop: 2, lineHeight: 14 }}>
                    Optional. If enabled, only the officer assigned to your region can see your name.
                  </Text>
                </View>
                <View
                  style={{
                    width: 42,
                    height: 24,
                    borderRadius: 12,
                    padding: 2,
                    backgroundColor: shareIdentity ? '#4f46e5' : 'rgba(148,163,184,0.2)',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#fff',
                      transform: [{ translateX: shareIdentity ? 18 : 0 }],
                    }}
                  />
                </View>
              </TouchableOpacity>

              {shareIdentity && (
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingBottom: 14,
                    gap: 10,
                    borderTopWidth: 1,
                    borderTopColor: 'rgba(148,163,184,0.08)',
                    paddingTop: 12,
                  }}
                >
                  <TextInput
                    value={reporterName}
                    onChangeText={setReporterName}
                    placeholder="Your name (as it should appear to officers)"
                    placeholderTextColor="#334155"
                    autoCapitalize="words"
                    style={{
                      color: '#e2e8f0',
                      fontSize: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.1)',
                    }}
                  />
                  <TextInput
                    value={reporterEmail}
                    onChangeText={setReporterEmail}
                    placeholder="Your email (optional)"
                    placeholderTextColor="#334155"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    style={{
                      color: '#e2e8f0',
                      fontSize: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      backgroundColor: 'rgba(0,0,0,0.3)',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.1)',
                    }}
                  />
                  <Text style={{ color: '#475569', fontSize: 10, lineHeight: 15 }}>
                    Only officers in your region can see this. It is not shared with the public or other citizens.
                  </Text>
                </View>
              )}
            </View>
            {/* ───────────────────────────────────────────────────────── */}

            {/* Optional extra evidence (collapsible) */}
            <TouchableOpacity
              onPress={toggleEvidence}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(30,41,59,0.4)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.08)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  flexShrink: 1,
                }}
              >
                <PaperclipIcon />
                <Text
                  style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600' }}
                  numberOfLines={1}
                >
                  Add extra evidence
                </Text>
                <Text
                  style={{ color: '#475569', fontSize: 10, fontWeight: '500' }}
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
                <TouchableOpacity
                  onPress={pickExtraFiles}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 16,
                    borderWidth: 1.5,
                    borderStyle: 'dashed',
                    borderColor: 'rgba(79,70,229,0.25)',
                    backgroundColor: 'rgba(30,41,59,0.3)',
                  }}
                >
                  <PaperclipIcon color="#818cf8" />
                  <Text
                    style={{ color: '#a5b4fc', fontSize: 12, fontWeight: '600' }}
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
                          gap: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: 'rgba(16,185,129,0.04)',
                          borderWidth: 1,
                          borderColor: 'rgba(16,185,129,0.12)',
                        }}
                      >
                        <CheckIcon size={12} />
                        <Text
                          style={{
                            color: '#cbd5e1',
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
                          <Text style={{ color: '#64748b', fontSize: 12 }}></Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: 'rgba(148,163,184,0.03)',
                    borderWidth: 1,
                    borderColor: 'rgba(148,163,184,0.06)',
                  }}
                >
                  <ShieldIcon size={12} color="#475569" />
                  <Text
                    style={{
                      color: '#475569',
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
            <ScamRiskBanner analyzing={analyzing} analysis={analysis} error={analyzeError} />

            {/* ZKP Commitment Card */}
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: 'rgba(79,70,229,0.04)',
                borderWidth: 1,
                borderColor: 'rgba(79,70,229,0.15)',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(79,70,229,0.1)',
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(79,70,229,0.12)',
                    flexShrink: 0,
                  }}
                >
                  <ShieldIcon size={14} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
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
                  <Text
                    style={{ color: '#64748b', fontSize: 10, marginTop: 1 }}
                    numberOfLines={1}
                  >
                    Identity protected · Commitment generated
                  </Text>
                </View>
              </View>
              <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <Text
                  style={{
                    color: '#475569',
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
                    padding: 12,
                    borderRadius: 12,
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
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: 'rgba(30,41,59,0.5)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.08)',
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: 'rgba(148,163,184,0.06)',
                }}
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
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
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
                      gap: 16,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Text
                      style={{
                        color: '#64748b',
                        fontSize: 11,
                        width: 68,
                        fontWeight: '500',
                        flexShrink: 0,
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
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 16,
                backgroundColor: 'rgba(16,185,129,0.03)',
                borderWidth: 1,
                borderColor: 'rgba(16,185,129,0.08)',
              }}
            >
              <CheckIcon size={12} />
              <Text
                style={{
                  color: '#64748b',
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
          paddingHorizontal: 16,
          paddingBottom: 16,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: 'rgba(148,163,184,0.06)',
          backgroundColor: 'rgba(10,17,32,0.95)',
        }}
      >
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => s - 1)}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(30,41,59,0.6)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
              }}
            >
              <Text
                style={{ color: '#94a3b8', fontSize: 13, fontWeight: '600' }}
              >
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
              paddingHorizontal: 16,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
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