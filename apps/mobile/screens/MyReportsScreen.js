// apps/mobile/screens/MyReportsScreen.js
//
// Lists the citizen's own report history straight from the local SQLite
// outbox (db/sqlite.js's getAllReports), so it works fully offline and
// shows the four-stage review lifecycle per report — queued, under review,
// confirmed, rejected — without an extra API call.
//
// Tapping a report opens a full detail modal that shows EVERYTHING the
// citizen originally submitted: the screenshot they attached, the OCR or
// typed text, the sender, the AI verdict, the ZKP proofs, the region,
// and the sync status. All data comes from the local SQLite row.

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

function StatusBadge({ report }) {
  // Four-stage citizen-visible review lifecycle:
  //   queued       — submitted, no officer has voted yet
  //   under_review — one officer has voted, waiting for the next
  //   confirmed    — 2+ scam approvals (number blacklisted OR
  //                  impersonation message confirmed)
  //   rejected     — 2+ rejections, message judged legitimate
  //
  // "synced" is orthogonal: it means the server received the report at
  // all. A report can be synced=true and reviewStatus='queued'.
  const rs = report?.reviewStatus || 'queued';

  let label = 'Queued';
  let color = {
    text: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.25)',
  };

  if (rs === 'under_review') {
    label = 'Under Review';
    color = {
      text: '#818cf8',
      bg: 'rgba(79,70,229,0.12)',
      border: 'rgba(79,70,229,0.25)',
    };
  } else if (rs === 'confirmed') {
    label = 'Confirmed';
    color = {
      text: '#10b981',
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
    };
  } else if (rs === 'rejected') {
    label = 'Rejected';
    color = {
      text: '#f43f5e',
      bg: 'rgba(244,63,94,0.12)',
      border: 'rgba(244,63,94,0.25)',
    };
  } else if (!report?.synced) {
    // Not yet on the server at all: surface the sync problem.
    if ((report?.syncAttempts ?? 0) >= 5) {
      label = 'Sync Failed';
      color = {
        text: '#f43f5e',
        bg: 'rgba(244,63,94,0.12)',
        border: 'rgba(244,63,94,0.25)',
      };
    } else {
      label = 'Queued (Offline)';
      color = {
        text: '#94a3b8',
        bg: 'rgba(148,163,184,0.12)',
        border: 'rgba(148,163,184,0.25)',
      };
    }
  }

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: color.bg,
        borderWidth: 1,
        borderColor: color.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: color.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}

function formatFullDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Detail row: small label + value pair used inside the modal ─────────
function DetailRow({ label, value, mono }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          color: '#64748b',
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
          color: '#e2e8f0',
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

// ─── Full report detail modal ───────────────────────────────────────────
function ReportDetailModal({ report, onClose }) {
  const { height } = useWindowDimensions();
  if (!report) return null;

  const hasScreenshot =
    typeof report.evidenceImage === 'string' && report.evidenceImage.length > 0;

  const aiLabel = report.aiRiskLevel || null;
  const aiConfidence =
    typeof report.aiConfidenceScore === 'number'
      ? `${Math.round(report.aiConfidenceScore * 100)}%`
      : null;

  const riskColor =
    aiLabel === 'HIGH' || aiLabel === 'malicious'
      ? '#f43f5e'
      : aiLabel === 'MEDIUM' || aiLabel === 'grey_area'
      ? '#facc15'
      : aiLabel === 'LOW' || aiLabel === 'legitimate'
      ? '#10b981'
      : '#94a3b8';

  const headerId =
    report.serverReportId ||
    (report.localId
      ? `LOCAL-${String(report.localId).slice(0, 8).toUpperCase()}`
      : '—');

  const cardHeight = Math.round(height * 0.85);
  const imageHeight = Math.round(height * 0.4);

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      {/* Backdrop — plain View. No touch handler so ScrollView gestures
          inside the card are not intercepted. Close via the header button. */}
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.75)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Card — plain View with explicit height, so the ScrollView
            inside can claim the pan gesture. */}
        <View
          style={{
            backgroundColor: '#0f172a',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            height: cardHeight,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(148,163,184,0.1)',
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '700' }}
                numberOfLines={1}
              >
                Report Details
              </Text>
              <Text
                style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}
                numberOfLines={1}
              >
                {headerId}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '600' }}>
                Close
              </Text>
            </TouchableOpacity>
          </View>

          {/* Body — ScrollView fills remaining card height */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            showsVerticalScrollIndicator={true}
            scrollEnabled={true}
            keyboardShouldPersistTaps="handled"
          >
            {/* Status */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 18,
              }}
            >
              <StatusBadge report={report} />
              <Text style={{ color: '#64748b', fontSize: 11 }}>
                {formatFullDate(report.createdAt)}
              </Text>
            </View>

            {/* Screenshot */}
            {hasScreenshot ? (
              <View style={{ marginBottom: 18 }}>
                <Text
                  style={{
                    color: '#64748b',
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
                    borderColor: 'rgba(148,163,184,0.15)',
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
                  backgroundColor: '#1e293b',
                  borderWidth: 1,
                  borderColor: 'rgba(148,163,184,0.1)',
                }}
              >
                <Text style={{ color: '#475569', fontSize: 11 }}>
                  No screenshot was attached to this report.
                </Text>
              </View>
            )}

            {/* AI verdict */}
            <View
              style={{
                padding: 14,
                borderRadius: 12,
                marginBottom: 18,
                backgroundColor: 'rgba(30,41,59,0.6)',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.15)',
              }}
            >
              <Text
                style={{
                  color: '#64748b',
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                AI VERDICT
              </Text>
              {aiLabel ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: `${riskColor}22`,
                      borderWidth: 1,
                      borderColor: `${riskColor}55`,
                    }}
                  >
                    <Text
                      style={{
                        color: riskColor,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {String(aiLabel).toUpperCase()}
                    </Text>
                  </View>
                  {aiConfidence && (
                    <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                      Confidence {aiConfidence}
                    </Text>
                  )}
                </View>
              ) : (
                <Text style={{ color: '#475569', fontSize: 11 }}>
                  AI analysis was not available when this report was submitted.
                </Text>
              )}
            </View>

            {/* Reported content */}
            <DetailRow label="MESSAGE / CONTENT" value={report.content} />

            {/* Sender */}
            <DetailRow
              label="REPORTED SENDER"
              value={report.senderNumber || report.reportedNumber}
            />

            {/* Scam type */}
            <DetailRow label="SCAM TYPE" value={report.scamType || 'UNKNOWN'} />

            {/* Region + location */}
            <DetailRow
              label="REGION"
              value={report.region || report.jurisdiction}
            />
            {report.latitude != null && report.longitude != null && (
              <DetailRow
                label="LOCATION"
                value={`${Number(report.latitude).toFixed(4)}, ${Number(
                  report.longitude
                ).toFixed(4)}`}
                mono
              />
            )}

            {/* ZKP proofs */}
            <DetailRow label="ZKP NULLIFIER" value={report.nullifier} mono />
            <DetailRow
              label="ZKP COMMITMENT HASH"
              value={report.zkpHash}
              mono
            />

            {/* Sync error */}
            {report.lastError && !report.synced && (
              <View
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: 'rgba(244,63,94,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(244,63,94,0.25)',
                }}
              >
                <Text
                  style={{
                    color: '#f43f5e',
                    fontSize: 11,
                    fontWeight: '600',
                    marginBottom: 2,
                  }}
                >
                  Sync error
                </Text>
                <Text style={{ color: '#fda4af', fontSize: 11 }}>
                  {report.lastError}
                </Text>
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
  const [reports, setReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [openReport, setOpenReport] = useState(null);

  const load = useCallback(async () => {
    try {
      // Pull fresh review statuses from the server first, so the badges
      // the user sees reflect the latest officer votes. Non-blocking on
      // failure — the local rows already carry the last-known status.
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ minWidth: 60, paddingVertical: 4 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '500' }}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>
          My Reports
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => String(item.localId)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818cf8"
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 10,
        }}
        ListEmptyComponent={
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 80,
              paddingHorizontal: 32,
            }}
          >
            <Text
              style={{ color: '#475569', fontSize: 13, textAlign: 'center' }}
            >
              No reports yet
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const hasThumb =
            typeof item.evidenceImage === 'string' &&
            item.evidenceImage.length > 0;
          const thumbUri = hasThumb ? item.evidenceImage : null;

          return (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setOpenReport(item)}
              style={{
                padding: 14,
                borderRadius: 12,
                backgroundColor: '#1e293b',
                borderWidth: 1,
                borderColor: 'rgba(148,163,184,0.1)',
                gap: 8,
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
                <Text
                  style={{
                    color: '#e2e8f0',
                    fontSize: 13,
                    fontWeight: '600',
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.scamType || 'UNKNOWN'}
                </Text>
                <StatusBadge report={item} />
              </View>

              {hasThumb ? (
                <View
                  style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: '#020617',
                      borderWidth: 1,
                      borderColor: 'rgba(148,163,184,0.15)',
                    }}
                  >
                    <Image
                      source={{ uri: thumbUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  </View>
                  <Text
                    style={{
                      color: '#94a3b8',
                      fontSize: 11,
                      lineHeight: 16,
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {item.content || ''}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}
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
                    color: '#334155',
                    fontSize: 10,
                    fontFamily: 'JetBrainsMono_400Regular',
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.serverReportId ||
                    (item.localId
                      ? `LOCAL-${String(item.localId).slice(0, 8).toUpperCase()}`
                      : '—')}
                </Text>
                <Text style={{ color: '#475569', fontSize: 10 }}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>

              {item.lastError && !item.synced && (
                <Text
                  style={{ color: '#f43f5e', fontSize: 10 }}
                  numberOfLines={1}
                >
                  Sync error: {item.lastError}
                </Text>
              )}

              <Text
                style={{
                  color: '#4f46e5',
                  fontSize: 10,
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
      />
    </SafeAreaView>
  );
}