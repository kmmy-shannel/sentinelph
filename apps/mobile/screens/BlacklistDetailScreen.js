// apps/mobile/screens/BlacklistDetailScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Circle, Path } from 'react-native-svg';

import api, { OfflineError, getBlacklistDetail } from '../lib/api';
import { cacheBlacklistEntry } from '../db/sqlite';
import { useTheme, spacing as S } from '../theme/ThemeContext';

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

function BackIcon({ size = 18, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M9.5 3.5L5 8l4.5 4.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ShieldIcon({ size = 20, color = '#f43f5e' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2L3 5v5c0 4 2.75 7 7 7.5 4.25-.5 7-3.5 7-7.5V5l-7-3z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path
        d="M7 10l2 2 4-5"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function InfoRow({ label, value, mono, theme }) {
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
          fontSize: 13,
          lineHeight: 18,
          fontFamily: mono ? 'JetBrainsMono_400Regular' : undefined,
        }}
      >
        {String(value)}
      </Text>
    </View>
  );
}

export default function BlacklistDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { theme } = useTheme();

  const identifier = route.params?.identifier || route.params?.phoneNumber || '';
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!identifier) {
      setError('No identifier provided.');
      setLoading(false);
      return;
    }
    try {
      const data = await getBlacklistDetail(identifier);
      setDetail(data);
      setError(null);
      if (data?.phoneNumber) {
        cacheBlacklistEntry(data).catch(() => {});
      }
    } catch (err) {
      if (err instanceof OfflineError) {
        setError('You are offline. Reconnect to view full details.');
      } else if (err?.status === 404) {
        setError('No registry entry found for this identifier.');
      } else {
        setError(err?.message || 'Could not load registry details.');
      }
    } finally {
      setLoading(false);
    }
  }, [identifier]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const isBrand = detail?.targetKind === 'brand';
  const headerLabel = isBrand
    ? detail?.brandName || 'Brand impersonation'
    : identifier;
  const headerSub = isBrand
    ? `Impersonated brand · reported sender: ${identifier}`
    : 'Confirmed scam number';

  const ai = detail?.aiFlag || {};
  const subtypeLabel = ai.subtype
    ? SUBTYPE_LABELS[ai.subtype] || ai.subtype
    : null;
  const aiConfidence =
    typeof ai.confidenceScore === 'number'
      ? Math.round(ai.confidenceScore * 100)
      : null;

  const officer = detail?.officerVerdict || null;
  const officerCorrected = Boolean(
    officer?.subtypeAction === 'corrected' && officer?.subtype
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: S.lg,
          paddingTop: 14,
          paddingBottom: 10,
          gap: S.md,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.borderSoft,
          }}
        >
          <BackIcon size={16} color={theme.primarySoft} />
        </TouchableOpacity>
        <Text
          style={{
            color: theme.text,
            fontSize: 16,
            fontWeight: '700',
            flex: 1,
          }}
          numberOfLines={1}
        >
          Registry Details
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.lg,
          paddingBottom: 40,
          gap: S.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primarySoft}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading && !detail ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : error && !detail ? (
          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: theme.roseTint,
              borderWidth: 1,
              borderColor: theme.roseTintBorder,
            }}
          >
            <Text style={{ color: theme.rose, fontSize: 13 }}>{error}</Text>
          </View>
        ) : detail ? (
          <>
            {/* Header card */}
            <View
              style={{
                padding: 18,
                borderRadius: 16,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.roseTint,
                    borderWidth: 1,
                    borderColor: theme.roseTintBorder,
                  }}
                >
                  <ShieldIcon size={22} color={theme.rose} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 16,
                      fontWeight: '700',
                      fontFamily: 'JetBrainsMono_400Regular',
                    }}
                    numberOfLines={1}
                  >
                    {headerLabel}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                    {headerSub}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: S.sm,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: theme.roseTint,
                    borderWidth: 1,
                    borderColor: theme.roseTintBorder,
                  }}
                >
                  <Text
                    style={{
                      color: theme.rose,
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: 0.3,
                    }}
                  >
                    {isBrand ? 'IMPERSONATED BRAND' : 'CONFIRMED SCAM'}
                  </Text>
                </View>
                {detail.reportCount ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: theme.surfaceMuted,
                      borderWidth: 1,
                      borderColor: theme.borderSoft,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                    >
                      {detail.reportCount} REPORT{detail.reportCount === 1 ? '' : 'S'}
                    </Text>
                  </View>
                ) : null}
                {detail.region && detail.region !== 'UNCLASSIFIED' ? (
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: theme.surfaceMuted,
                      borderWidth: 1,
                      borderColor: theme.borderSoft,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                    >
                      {detail.region}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* AI verdict */}
            {ai && (ai.label || subtypeLabel) ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: 16,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                  }}
                >
                  AI VERDICT
                </Text>

                {ai.label ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: theme.roseTint,
                        borderWidth: 1,
                        borderColor: theme.roseTintBorder,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.rose,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {String(ai.label).toUpperCase()}
                      </Text>
                    </View>
                    {aiConfidence != null ? (
                      <Text style={{ color: theme.textDim, fontSize: 11 }}>
                        {aiConfidence}% confidence
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {subtypeLabel ? (
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 10,
                      backgroundColor: theme.surfaceMuted,
                      borderWidth: 1,
                      borderColor: theme.borderSoft,
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
                      SUBTYPE
                    </Text>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {subtypeLabel}
                    </Text>
                  </View>
                ) : null}

                {Array.isArray(ai.explanationReasons) && ai.explanationReasons.length > 0 ? (
                  <View
                    style={{
                      marginTop: 6,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: theme.borderSoft,
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 9,
                        fontWeight: '700',
                        letterSpacing: 1,
                      }}
                    >
                      WHY THIS WAS FLAGGED
                    </Text>
                    {ai.explanationReasons.map((r, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text
                          style={{
                            color: theme.rose,
                            fontSize: 12,
                            fontWeight: '700',
                            marginTop: 1,
                          }}
                        >
                          {i + 1}.
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 12,
                              fontWeight: '600',
                            }}
                          >
                            {r.category}
                          </Text>
                          <Text
                            style={{
                              color: theme.textMuted,
                              fontSize: 11,
                              lineHeight: 15,
                              marginTop: 2,
                            }}
                          >
                            {r.description}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Officer verdict */}
            {officer && officer.verifiedAt ? (
              <View
                style={{
                  padding: 16,
                  borderRadius: 16,
                  backgroundColor: officerCorrected
                    ? 'rgba(59,130,246,0.08)'
                    : 'rgba(16,185,129,0.06)',
                  borderWidth: 1,
                  borderColor: officerCorrected
                    ? 'rgba(59,130,246,0.25)'
                    : 'rgba(16,185,129,0.25)',
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    color: theme.textMuted,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 1,
                  }}
                >
                  OFFICER REVIEW
                </Text>
                <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18 }}>
                  {officerCorrected
                    ? "An officer corrected the AI's subtype. The correction has been applied to the registry."
                    : 'An officer confirmed the AI classification.'}
                </Text>
                {officerCorrected && officer.subtype ? (
                  <View
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      backgroundColor: theme.surfaceMuted,
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
                      {SUBTYPE_LABELS[officer.subtype] || officer.subtype}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Metadata */}
            <View
              style={{
                padding: 16,
                borderRadius: 16,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <InfoRow
                theme={theme}
                label="IDENTIFIER"
                value={detail.phoneNumber}
                mono
              />
              {isBrand ? (
                <InfoRow
                  theme={theme}
                  label="IMPERSONATED BRAND"
                  value={detail.brandName}
                />
              ) : null}
              <InfoRow
                theme={theme}
                label="STATUS"
                value={
                  detail.status === 'blacklisted' || detail.status === 'approved'
                    ? 'Confirmed scam'
                    : detail.status === 'under_review'
                    ? 'Under review'
                    : detail.status
                }
              />
              <InfoRow theme={theme} label="REGION" value={detail.region} />
              {detail.blacklistedAt ? (
                <InfoRow
                  theme={theme}
                  label="BLACKLISTED AT"
                  value={new Date(detail.blacklistedAt).toLocaleString('en-PH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}