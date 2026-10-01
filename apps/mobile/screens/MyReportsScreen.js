// apps/mobile/screens/MyReportsScreen.js
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getAllReports } from '../db/sqlite';
import { syncNow, refreshReportStatuses } from '../db/syncQueue';
import { useTheme, spacing as S } from '../theme/ThemeContext';

// ─── Human-readable subtype labels (mirrors the web app) ─────────────
const SUBTYPE_LABELS = {
  personal_conversational: 'Personal Conversation',
  two_factor_auth: 'One-Time Password (OTP)',
  appointment_reminder: 'Appointment Reminder',
  delivery_tracking: 'Delivery Tracking',
  bank_activity_alert: 'Bank Activity Alert',
  brand_marketing: 'Brand Marketing',
  phishing_link: 'Phishing Link (Smishing)',
  fake_prize_lottery: 'Fake Prize / Lottery',
  wrong_number_baiting: 'Wrong-Number Baiting',
  urgent_fine_toll: 'Urgent Fine / Toll',
  impersonation_family: 'Impersonation (Family)',
  UNLABELED: 'Unable to Classify',
};

function riskPalette(theme) {
  return {
    malicious: {
      text: theme.rose,
      bg: theme.roseTint,
      border: theme.roseTintBorder,
    },
    grey_area: {
      text: theme.amber,
      bg: 'rgba(234,179,8,0.12)',
      border: 'rgba(234,179,8,0.3)',
    },
    legitimate: {
      text: theme.emerald,
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.3)',
    },
    unknown: {
      text: theme.textDim,
      bg: 'rgba(148,163,184,0.12)',
      border: 'rgba(148,163,184,0.3)',
    },
  };
}

function tierFromLabel(aiLabel) {
  if (!aiLabel) return 'unknown';
  const s = String(aiLabel).toLowerCase();
  if (s === 'malicious' || s === 'likely_scam' || s === 'high') return 'malicious';
  if (s === 'grey_area' || s === 'uncertain' || s === 'medium') return 'grey_area';
  if (s === 'legitimate' || s === 'likely_legitimate' || s === 'low') return 'legitimate';
  return 'unknown';
}

// ─── Status badge ─────────────────────────────────────────────────────
function StatusBadge({ report, theme }) {
  const rs = report?.reviewStatus || 'queued';
  let label = 'Queued';
  let color = {
    text: theme.amber,
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.25)',
  };

  if (rs === 'under_review') {
    label = 'Under Review';
    color = {
      text: theme.primarySoft,
      bg: theme.primaryTint,
      border: theme.primaryTintBorder,
    };
  } else if (rs === 'confirmed') {
    label = 'Confirmed';
    color = {
      text: theme.emerald,
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
    };
  } else if (rs === 'rejected') {
    label = 'Rejected';
    color = {
      text: theme.rose,
      bg: theme.roseTint,
      border: theme.roseTintBorder,
    };
  } else if (!report?.synced) {
    if ((report?.syncAttempts ?? 0) >= 5) {
      label = 'Sync Failed';
      color = {
        text: theme.rose,
        bg: theme.roseTint,
        border: theme.roseTintBorder,
      };
    } else {
      label = 'Queued (Offline)';
      color = {
        text: theme.textDim,
        bg: 'rgba(148,163,184,0.12)',
        border: 'rgba(148,163,184,0.25)',
      };
    }
  }

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: color.bg,
        borderWidth: 1,
        borderColor: color.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: color.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Subtype pill ─────────────────────────────────────────────────────
function SubtypePill({ aiLabel, subtype, theme }) {
  if (!subtype) return null;
  const tier = tierFromLabel(aiLabel);
  const RISK_COLORS = riskPalette(theme);
  const c = RISK_COLORS[tier] || RISK_COLORS.unknown;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: c.text,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        }}
      >
        {SUBTYPE_LABELS[subtype] || subtype}
      </Text>
    </View>
  );
}

// ─── Formatting ───────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

function formatFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Detail row ───────────────────────────────────────────────────────
function DetailRow({ label, value, mono, theme }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: theme.textMuted,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: theme.text,
          fontSize: 12,
          lineHeight: 17,
          fontFamily: mono ? 'JetBrainsMono_400Regular' : undefined,
        }}
      >
        {String(value)}
      </Text>
    </View>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────
function ReportDetailModal({ report, onClose, theme }) {
  const { height } = useWindowDimensions();
  if (!report) return null;

  const hasScreenshot =
    typeof report.evidenceImage === 'string' && report.evidenceImage.length > 0;

  const aiLabel = report.aiLabel || report.aiRiskLevel || null;
  const tier = tierFromLabel(aiLabel);
  const RISK_COLORS = riskPalette(theme);
  const tierColor = RISK_COLORS[tier] || RISK_COLORS.unknown;

  const aiConfidence =
    typeof report.aiConfidenceScore === 'number'
      ? `${Math.round(report.aiConfidenceScore * 100)}%`
      : null;

  const subtypeLabel = report.aiSubtype
    ? SUBTYPE_LABELS[report.aiSubtype] || report.aiSubtype
    : null;

  const headerId =
    report.serverReportId ||
    (report.localId
      ? `LOCAL-${String(report.localId).slice(0, 8).toUpperCase()}`
      : '—');

  const cardHeight = Math.round(height * 0.85);
  const imageHeight = Math.round(height * 0.4);

  const officerVerified = Boolean(report.officerVerifiedAt);
  const officerSubtype = report.officerSubtype || null;
  const officerCorrected = Boolean(
    report.officerSubtypeAction === 'corrected' && officerSubtype
  );
  const officerConfirmed = report.officerSubtypeAction === 'confirmed';

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.75)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            height: cardHeight,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                Report Details
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                {headerId}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: theme.primarySoft, fontSize: 13, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
              }}
            >
              <StatusBadge report={report} theme={theme} />
              <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                {formatFullDate(report.createdAt)}
              </Text>
            </View>

            {/* AI VERDICT (with subtype) */}
            <View
              style={{
                padding: 16,
                borderRadius: 14,
                marginBottom: 18,
                backgroundColor: tierColor.bg,
                borderWidth: 1,
                borderColor: tierColor.border,
              }}
            >
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1,
                  marginBottom: 10,
                }}
              >
                AI VERDICT
              </Text>

              {aiLabel ? (
                <>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: subtypeLabel ? 12 : 0,
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: `${tierColor.text}22`,
                        borderWidth: 1,
                        borderColor: `${tierColor.text}55`,
                      }}
                    >
                      <Text style={{ color: tierColor.text, fontSize: 11, fontWeight: '700' }}>
                        {String(aiLabel).toUpperCase()}
                      </Text>
                    </View>
                    {aiConfidence && (
                      <Text style={{ color: theme.textDim, fontSize: 11 }}>
                        Confidence {aiConfidence}
                      </Text>
                    )}
                  </View>

                  {subtypeLabel && (
                    <View>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 9,
                          fontWeight: '700',
                          letterSpacing: 1,
                          marginBottom: 6,
                        }}
                      >
                        SUBTYPE
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor: theme.surfaceAlt,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 12,
                            fontWeight: '600',
                          }}
                        >
                          {subtypeLabel}
                        </Text>
                        {typeof report.aiSubtypeConfidence === 'number' && (
                          <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 3 }}>
                            {Math.round(report.aiSubtypeConfidence * 100)}% confidence
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {Array.isArray(report.aiExplanationReasons) &&
                    report.aiExplanationReasons.length > 0 && (
                      <View
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: theme.borderSoft,
                        }}
                      >
                        <Text
                          style={{
                            color: theme.textMuted,
                            fontSize: 9,
                            fontWeight: '700',
                            letterSpacing: 1,
                            marginBottom: 8,
                          }}
                        >
                          WHY THIS WAS FLAGGED
                        </Text>
                        {report.aiExplanationReasons.map((r, i) => (
                          <View
                            key={i}
                            style={{
                              flexDirection: 'row',
                              gap: 8,
                              marginBottom: i < report.aiExplanationReasons.length - 1 ? 10 : 0,
                            }}
                          >
                            <Text
                              style={{
                                color: tierColor.text,
                                fontSize: 12,
                                fontWeight: '700',
                                marginTop: 1,
                              }}
                            >
                              {i + 1}.
                            </Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
                                {r.category}
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 }}>
                                {r.description}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                </>
              ) : (
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  AI analysis was not available when this report was submitted.
                </Text>
              )}
            </View>

            {/* OFFICER REVIEW OUTCOME */}
            {officerVerified && (
              <View
                style={{
                  padding: 16,
                  borderRadius: 14,
                  marginBottom: 18,
                  backgroundColor: officerCorrected
                    ? 'rgba(59,130,246,0.08)'
                    : officerConfirmed
                    ? 'rgba(16,185,129,0.06)'
                    : theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: officerCorrected
                    ? 'rgba(59,130,246,0.25)'
                    : officerConfirmed
                    ? 'rgba(16,185,129,0.25)'
                    : theme.border,
                }}
              >
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 8,
                  }}
                >
                  OFFICER REVIEW
                </Text>
                <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18 }}>
                  {officerCorrected
                    ? `An officer reviewed this report and corrected the AI's subtype. Your report helped improve the model.`
                    : officerConfirmed
                    ? `An officer confirmed the AI's classification. Thanks for submitting this report.`
                    : `An officer has reviewed your report.`}
                </Text>
                {officerSubtype && officerCorrected && (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: theme.surfaceAlt,
                      borderWidth: 1,
                      borderColor: 'rgba(59,130,246,0.2)',
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
                      CORRECTED TO
                    </Text>
                    <Text
                      style={{
                        color: '#3b82f6',
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {SUBTYPE_LABELS[officerSubtype] || officerSubtype}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Screenshot */}
            {hasScreenshot ? (
              <View style={{ marginBottom: 18 }}>
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                    marginBottom: 6,
                  }}
                >
                  SCREENSHOT ATTACHED
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: imageHeight,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: '#020617',
                  }}
                >
                  <Image
                    source={{ uri: report.evidenceImage }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              </View>
            ) : (
              <View
                style={{
                  marginBottom: 18,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: theme.surfaceAlt,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  No screenshot was attached to this report.
                </Text>
              </View>
            )}

            <DetailRow theme={theme} label="MESSAGE / CONTENT" value={report.content} />
            <DetailRow
              theme={theme}
              label="REPORTED SENDER"
              value={report.senderNumber || report.reportedNumber}
            />
            <DetailRow theme={theme} label="SCAM TYPE" value={report.scamType || 'UNKNOWN'} />
            <DetailRow theme={theme} label="REGION" value={report.region || report.jurisdiction} />
            {report.latitude != null && report.longitude != null && (
              <DetailRow
                theme={theme}
                label="LOCATION"
                value={`${Number(report.latitude).toFixed(4)}, ${Number(report.longitude).toFixed(4)}`}
                mono
              />
            )}

            <DetailRow theme={theme} label="ZKP NULLIFIER" value={report.nullifier} mono />
            <DetailRow theme={theme} label="ZKP COMMITMENT HASH" value={report.zkpHash} mono />

            {report.lastError && !report.synced && (
              <View
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: theme.roseTint,
                  borderWidth: 1,
                  borderColor: theme.roseTintBorder,
                }}
              >
                <Text
                  style={{
                    color: theme.rose,
                    fontSize: 11,
                    fontWeight: '600',
                    marginBottom: 2,
                  }}
                >
                  Sync error
                </Text>
                <Text style={{ color: theme.roseText, fontSize: 11 }}>{report.lastError}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MyReportsScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();
  const [reports, setReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openReport, setOpenReport] = useState(null);

  const load = useCallback(async () => {
    try {
      await refreshReportStatuses().catch(() => {});
      const all = await getAllReports();
      const safe = Array.isArray(all)
        ? all.filter((r) => r && r.localId != null)
        : [];
      setReports(safe);
    } catch (err) {
      console.error('[MyReportsScreen] load failed:', err?.message);
      setReports([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncNow().catch(() => {});
    await refreshReportStatuses().catch(() => {});
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: S.lg,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ minWidth: 64, paddingVertical: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: theme.primarySoft, fontSize: 13, fontWeight: '600' }}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>
          My Reports
        </Text>
        <View style={{ width: 64 }} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => String(item.localId)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primarySoft}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: S.lg,
          paddingTop: S.sm,
          paddingBottom: 24,
          gap: S.md,
        }}
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 80,
              paddingHorizontal: 32,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.primaryFaint,
                borderWidth: 1,
                borderColor: theme.primaryTintBorder,
              }}
            >
              <Text style={{ color: theme.primarySoft, fontSize: 22 }}>📝</Text>
            </View>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
              No reports yet
            </Text>
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 12,
                textAlign: 'center',
                lineHeight: 18,
                maxWidth: 260,
              }}
            >
              Submit a suspicious message to help protect your community.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const hasThumb =
            typeof item.evidenceImage === 'string' && item.evidenceImage.length > 0;
          const thumbUri = hasThumb ? item.evidenceImage : null;

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setOpenReport(item)}
              style={{
                padding: 16,
                borderRadius: 14,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text
                    style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}
                    numberOfLines={1}
                  >
                    {item.scamType || 'UNKNOWN'}
                  </Text>
                  {item.aiSubtype && (
                    <SubtypePill
                      theme={theme}
                      aiLabel={item.aiLabel || item.aiRiskLevel}
                      subtype={item.aiSubtype}
                    />
                  )}
                </View>
                <StatusBadge report={item} theme={theme} />
              </View>

              {hasThumb ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: '#020617',
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <Image
                      source={{ uri: thumbUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                  <Text
                    style={{ color: theme.textDim, fontSize: 12, lineHeight: 17, flex: 1 }}
                    numberOfLines={2}
                  >
                    {item.content || ''}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{ color: theme.textDim, fontSize: 12, lineHeight: 17 }}
                  numberOfLines={2}
                >
                  {item.content || ''}
                </Text>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: theme.textFaint,
                    fontSize: 10,
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.serverReportId ||
                    (item.localId
                      ? `LOCAL-${String(item.localId).slice(0, 8).toUpperCase()}`
                      : '—')}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 10 }}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>

              {item.lastError && !item.synced && (
                <Text style={{ color: theme.rose, fontSize: 10 }} numberOfLines={1}>
                  Sync error: {item.lastError}
                </Text>
              )}

              <Text
                style={{
                  color: theme.primarySoft,
                  fontSize: 11,
                  fontWeight: '600',
                  marginTop: 2,
                }}
              >
                Tap to view full details →
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <ReportDetailModal
        report={openReport}
        onClose={() => setOpenReport(null)}
        theme={theme}
      />
    </SafeAreaView>
  );
}