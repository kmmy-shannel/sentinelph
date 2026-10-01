// apps/mobile/screens/HomeScreen.js
//
// Dashboard: offline/sync status, quick report CTA, four-stage review
// counters (queued / under review / confirmed / rejected), and a live
// feed of the most recently confirmed scam numbers across the whole
// country.
//
// The feed reads from the local blacklist_cache (populated by the
// Search tab's browse mode from GET /api/v1/blacklist/public), so it
// works offline once anything has been cached. Tapping a feed row
// jumps to the Search screen pre-filled with that number.
//
// Theme: colors come from useTheme() so the screen responds to the
// global dark/light toggle. No data-layer code is affected.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';

// NOTE: BlacklistStatusBanner import removed along with the banner.
// Re-add if you want to bring the threat banner back.
// import BlacklistStatusBanner from '../components/BlacklistStatusBanner';

import OfflineSyncIndicator from '../components/OfflineSyncIndicator';
import QuickReportCard from '../components/QuickReportCard';
import api, { OfflineError } from '../lib/api';
import {
  getAllReports,
  getAllBlacklistCache,
  cacheBlacklistBulk,
} from '../db/sqlite';
import { refreshReportStatuses } from '../db/syncQueue';
import { useTheme, spacing as S } from '../theme/ThemeContext';

const FEED_LIMIT = 5;

// ─── SVG icons — vector, matched stroke weights, no emoji/text glyphs ──
function ClockIcon({ size = 14, color = '#f59e0b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6} stroke={color} strokeWidth={1.4} />
      <Path
        d="M8 4.5V8l2.5 1.5"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EyeIcon({ size = 14, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Circle cx={8} cy={8} r={2} stroke={color} strokeWidth={1.3} />
    </Svg>
  );
}

function ShieldCheckIcon({ size = 14, color = '#10b981' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 1.5L2.5 4v4c0 3.1 2.25 5.45 5.5 6 3.25-.55 5.5-2.9 5.5-6V4L8 1.5z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 8l1.75 1.75L10.5 6"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CloseIcon({ size = 12, color = '#f43f5e' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="M2 2l8 8M10 2l-8 8"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronRight({ size = 12, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ─── Section header — small uppercase label + optional subtitle ───────
function SectionHeader({ title, subtitle, right, theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: S.sm,
        paddingHorizontal: 2,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: theme.textDim,
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 12,
              marginTop: 3,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

// ─── Stat counter — icon + value + label, aligned consistently ────────
function StatCounter({ icon, label, value, color, theme }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        gap: 6,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${color}1A`,
        }}
      >
        {icon}
      </View>
      <Text
        style={{
          color: theme.text,
          fontSize: 22,
          fontWeight: '700',
          letterSpacing: -0.5,
          lineHeight: 24,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text
        style={{
          color: theme.textMuted,
          fontSize: 9,
          fontWeight: '700',
          textAlign: 'center',
          letterSpacing: 0.6,
          lineHeight: 11,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Live Registry Feed — newest confirmed scam numbers ──────────────
//
// Defensive render: every entry is validated before its key is built.
// Two guards prevent the "Each child in a list should have a unique
// key" warning that fires when two rows have the same (or missing)
// `value`:
//   1. The parent filters entries so every row has a non-empty string
//      identifier. Malformed rows never reach the feed.
//   2. Even if one slipped through, the key falls back to `idx`, so
//      the key is always unique.
function LiveRegistryFeed({ entries, onPressEntry, onBrowseAll, theme }) {
  return (
    <View
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
          paddingBottom: S.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderSoft,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: theme.text,
              fontSize: 14,
              fontWeight: '700',
              letterSpacing: 0.1,
            }}
          >
            Live Registry Feed
          </Text>
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 12,
              marginTop: 3,
            }}
            numberOfLines={1}
          >
            Latest numbers confirmed as scams
          </Text>
        </View>
        {entries.length > 0 && (
          <TouchableOpacity
            onPress={onBrowseAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: theme.primarySoft,
                fontSize: 12,
                fontWeight: '600',
              }}
            >
              Browse all
            </Text>
            <ChevronRight size={12} color={theme.primarySoft} />
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      {entries.length === 0 ? (
        <View
          style={{
            paddingHorizontal: S.xl,
            paddingVertical: 28,
            alignItems: 'center',
            gap: S.md,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.primaryFaint,
              borderWidth: 1,
              borderColor: theme.primaryTintBorder,
            }}
          >
            <EyeIcon size={18} color={theme.primarySoft} />
          </View>
          <Text
            style={{
              color: theme.text,
              fontSize: 13,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            No confirmed scams yet
          </Text>
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 12,
              lineHeight: 18,
              textAlign: 'center',
              maxWidth: 260,
            }}
          >
            Once officers confirm a number as a scam, it appears here so
            you can check it before answering.
          </Text>
          <TouchableOpacity
            onPress={onBrowseAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              marginTop: 2,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: theme.primaryTint,
              borderWidth: 1,
              borderColor: theme.primaryTintBorder,
            }}
          >
            <Text
              style={{
                color: theme.primarySoft,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              Open registry
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          {entries.map((entry, idx) => (
            <TouchableOpacity
              // Composite key: value if present, idx always. Guarantees
              // uniqueness even if the server/cache returns a malformed
              // or duplicated `value`.
              key={`${entry?.value || 'unknown'}::${idx}`}
              activeOpacity={0.7}
              onPress={() => onPressEntry(entry)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: S.md,
                paddingHorizontal: S.lg,
                paddingVertical: 14,
                borderTopWidth: idx === 0 ? 0 : 1,
                borderTopColor: theme.borderSoft,
              }}
            >
              {/* Status dot */}
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.roseTint,
                  borderWidth: 1,
                  borderColor: theme.roseTintBorder,
                  flexShrink: 0,
                }}
              >
                <CloseIcon size={13} color={theme.rose} />
              </View>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 13,
                    fontFamily: 'JetBrainsMono_400Regular',
                  }}
                  numberOfLines={1}
                >
                  {entry.value}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                    flexWrap: 'wrap',
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.roseTint,
                      borderWidth: 1,
                      borderColor: theme.roseTintBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.roseText,
                        fontSize: 10,
                        fontWeight: '700',
                        letterSpacing: 0.3,
                      }}
                    >
                      {(entry.scamType || 'Scam').toString().toUpperCase()}
                    </Text>
                  </View>
                  {entry.reportCount ? (
                    <Text
                      style={{
                        color: theme.textFaint,
                        fontSize: 11,
                      }}
                    >
                      {entry.reportCount} report
                      {entry.reportCount === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                  {entry.region && entry.region !== 'UNCLASSIFIED' ? (
                    <Text
                      style={{
                        color: theme.textFaint,
                        fontSize: 11,
                      }}
                    >
                      · {entry.region}
                    </Text>
                  ) : null}
                </View>
              </View>

              <ChevronRight size={12} color={theme.textFaint} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  void width; // reserved for future responsive tweaks

  const { theme } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [threatLevel, setThreatLevel] = useState('safe');
  const [stats, setStats] = useState({
    queued: 0,
    underReview: 0,
    confirmed: 0,
    rejected: 0,
  });
  const [feedEntries, setFeedEntries] = useState([]);

  const loadDashboard = useCallback(async () => {
    // ── Local: report counts ─────────────────────────────────────────
    try {
      await refreshReportStatuses().catch(() => {});

      const all = await getAllReports();
      const queued = all.filter(
        (r) => (r.reviewStatus || 'queued') === 'queued'
      ).length;
      const underReview = all.filter(
        (r) => r.reviewStatus === 'under_review'
      ).length;
      const confirmed = all.filter(
        (r) => r.reviewStatus === 'confirmed'
      ).length;
      const rejected = all.filter(
        (r) => r.reviewStatus === 'rejected'
      ).length;

      setStats({ queued, underReview, confirmed, rejected });
    } catch (err) {
      console.warn('[HomeScreen] failed to read local reports:', err?.message);
    }

    // ── Cache: serve feed immediately from what's already stored ─────
    try {
      const cached = await getAllBlacklistCache(50);
      const seen = new Set();
      const safe = [];
      for (const e of cached) {
        if (!e || typeof e.value !== 'string' || e.value.length === 0) continue;
        if (seen.has(e.value)) continue;
        seen.add(e.value);
        safe.push(e);
        if (safe.length >= FEED_LIMIT) break;
      }
      if (safe.length > 0) setFeedEntries(safe);
    } catch (err) {
      console.warn('[HomeScreen] cache read failed:', err?.message);
    }

    // ── Remote: refresh registry + threat level ──────────────────────
    try {
      const [registryRes, statusRes] = await Promise.all([
        api.get('/api/v1/blacklist/public', { params: { limit: 50 } }),
        api.get('/api/v1/status/summary'),
      ]);

      const rawEntries = registryRes.data?.data || [];
      if (rawEntries.length > 0) {
        await cacheBlacklistBulk(rawEntries).catch(() => {});

        let storedRegion = null;
        try {
          storedRegion = await AsyncStorage.getItem(
            '@sentinelph_user_region'
          );
        } catch {
          // Non-fatal — sort falls back to date-only.
        }

        const sorted = [...rawEntries].sort((a, b) => {
          const aLocal =
            storedRegion && a.region === storedRegion ? 1 : 0;
          const bLocal =
            storedRegion && b.region === storedRegion ? 1 : 0;
          if (aLocal !== bLocal) return bLocal - aLocal;
          const aT = a.blacklistedAt
            ? new Date(a.blacklistedAt).getTime()
            : 0;
          const bT = b.blacklistedAt
            ? new Date(b.blacklistedAt).getTime()
            : 0;
          return bT - aT;
        });

        const seen = new Set();
        const safe = [];
        for (const e of sorted) {
          const value = typeof e?.phoneNumber === 'string' ? e.phoneNumber : '';
          if (!value || seen.has(value)) continue;
          seen.add(value);
          safe.push({
            value,
            scamType: e.scamType || null,
            reportCount: e.reportCount ?? 0,
            region: e.region || null,
            blacklistedAt: e.blacklistedAt || null,
            status: e.status || 'blacklisted',
          });
          if (safe.length >= FEED_LIMIT) break;
        }
        if (safe.length > 0) setFeedEntries(safe);
      }

      // threatLevel is still fetched (harmless) so re-enabling the
      // banner later only requires uncommenting the render line below.
      setThreatLevel(statusRes.data?.threatLevel || 'safe');
    } catch (err) {
      if (err instanceof OfflineError) {
        // Silent — cache already served.
      } else if (err?.response?.status === 404) {
        console.warn('[HomeScreen] dashboard endpoints not available yet');
      } else {
        console.warn(
          '[HomeScreen] failed to load remote dashboard data:',
          err?.message
        );
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [loadDashboard])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  // Tapping a feed row jumps to Search pre-filled with that number.
  const openInSearch = useCallback(
    (entry) => {
      if (!entry?.value) return;
      navigation.navigate('Search', {
        initialQuery: entry.value,
      });
    },
    [navigation]
  );

  const openSearch = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  // Keep threatLevel referenced to avoid unused-variable warnings if you
  // later decide to remove the state entirely.
  void threatLevel;

  return (
    <SafeAreaView
      edges={['top']}
      style={{ flex: 1, backgroundColor: theme.bg }}
    >
      {/*
        Threat banner removed for a cleaner home screen.
        To restore: uncomment the import at the top of this file and
        the single line below.

        <BlacklistStatusBanner level={threatLevel} />
      */}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
          paddingBottom: 32,
          gap: S.lg,
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
        <OfflineSyncIndicator />

        <QuickReportCard
          onQuickReport={() => navigation.navigate('ReportWizard')}
          onCameraShortcut={() =>
            navigation.navigate('ReportWizard', {
              openStep: 2,
              focus: 'camera',
            })
          }
        />

        {/* Four-stage counters */}
        <View>
          <SectionHeader
            theme={theme}
            title="Your Reports"
            subtitle="Track your submissions through officer review"
          />
          <View
            style={{
              flexDirection: 'row',
              gap: S.sm,
            }}
          >
            <StatCounter
              theme={theme}
              icon={<ClockIcon />}
              label="QUEUED"
              value={stats.queued}
              color={theme.amber}
            />
            <StatCounter
              theme={theme}
              icon={<EyeIcon />}
              label="REVIEW"
              value={stats.underReview}
              color={theme.indigo}
            />
            <StatCounter
              theme={theme}
              icon={<ShieldCheckIcon />}
              label="CONFIRMED"
              value={stats.confirmed}
              color={theme.emerald}
            />
            <StatCounter
              theme={theme}
              icon={<CloseIcon size={14} color={theme.rose} />}
              label="DISMISSED"
              value={stats.rejected}
              color={theme.rose}
            />
          </View>
        </View>

        <View>
          <SectionHeader
            theme={theme}
            title="Community Registry"
            subtitle="Numbers recently confirmed by officers"
          />
          <LiveRegistryFeed
            theme={theme}
            entries={feedEntries}
            onPressEntry={openInSearch}
            onBrowseAll={openSearch}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}