// apps/mobile/screens/HomeScreen.js
import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';

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
            style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}
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

function LiveRegistryFeed({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  entries,
  kind,
  onPressEntry,
  onBrowseAll,
  theme,
}) {
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
            {title}
          </Text>
          <Text
            style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
        {entries.length > 0 ? (
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
        ) : null}
      </View>

      {entries.length === 0 ? (
        <View
          style={{
            paddingHorizontal: S.xl,
            paddingVertical: 24,
            alignItems: 'center',
            gap: S.md,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.primaryFaint,
              borderWidth: 1,
              borderColor: theme.primaryTintBorder,
            }}
          >
            <EyeIcon size={16} color={theme.primarySoft} />
          </View>
          <Text
            style={{
              color: theme.text,
              fontSize: 13,
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {emptyTitle}
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
            {emptyBody}
          </Text>
        </View>
      ) : (
        <View>
          {entries.map((entry, idx) => (
            <TouchableOpacity
              key={`${kind}::${entry?.value || 'unknown'}::${idx}`}
              activeOpacity={0.7}
              onPress={() => onPressEntry(entry, kind)}
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
                  {entry.scamType ? (
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
                        {entry.scamType.toString().toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                  {entry.reportCount ? (
                    <Text style={{ color: theme.textFaint, fontSize: 11 }}>
                      {entry.reportCount} report
                      {entry.reportCount === 1 ? '' : 's'}
                    </Text>
                  ) : null}
                  {entry.region && entry.region !== 'UNCLASSIFIED' ? (
                    <Text style={{ color: theme.textFaint, fontSize: 11 }}>
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

export default function HomeScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    queued: 0,
    underReview: 0,
    confirmed: 0,
    rejected: 0,
  });
  const [numberEntries, setNumberEntries] = useState([]);
  const [brandEntries, setBrandEntries] = useState([]);

  const loadGenRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const gen = ++loadGenRef.current;

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

    // Cache serve
    try {
      const cached = await getAllBlacklistCache(80);
      const numbers = [];
      const brands = [];
      const seenN = new Set();
      const seenB = new Set();
      for (const e of cached) {
        if (!e || typeof e.value !== 'string' || e.value.length === 0) continue;
        if (e.targetKind === 'brand') {
          if (seenB.has(e.value)) continue;
          seenB.add(e.value);
          brands.push(e);
          if (brands.length >= FEED_LIMIT) continue;
        } else {
          if (seenN.has(e.value)) continue;
          seenN.add(e.value);
          numbers.push(e);
          if (numbers.length >= FEED_LIMIT) continue;
        }
      }
      if (gen === loadGenRef.current) {
        if (numbers.length > 0) setNumberEntries(numbers.slice(0, FEED_LIMIT));
        if (brands.length > 0) setBrandEntries(brands.slice(0, FEED_LIMIT));
      }
    } catch (err) {
      console.warn('[HomeScreen] cache read failed:', err?.message);
    }

    // Remote refresh
    try {
      const registryRes = await api.get('/api/v1/blacklist/public', {
        params: { limit: 60 },
      });
      const rawEntries = registryRes.data?.data || [];
      if (gen !== loadGenRef.current) return;

      if (rawEntries.length > 0) {
        await cacheBlacklistBulk(rawEntries).catch(() => {});

        let storedRegion = null;
        try {
          storedRegion = await AsyncStorage.getItem('@sentinelph_user_region');
        } catch {}

        const sorted = [...rawEntries].sort((a, b) => {
          const aLocal = storedRegion && a.region === storedRegion ? 1 : 0;
          const bLocal = storedRegion && b.region === storedRegion ? 1 : 0;
          if (aLocal !== bLocal) return bLocal - aLocal;
          const aT = a.blacklistedAt ? new Date(a.blacklistedAt).getTime() : 0;
          const bT = b.blacklistedAt ? new Date(b.blacklistedAt).getTime() : 0;
          return bT - aT;
        });

        const seenN = new Set();
        const seenB = new Set();
        const numbers = [];
        const brands = [];
        for (const e of sorted) {
          const value = typeof e?.phoneNumber === 'string' ? e.phoneNumber : '';
          if (!value) continue;
          const targetKind = e.targetKind === 'brand' ? 'brand' : 'number';
          const row = {
            value,
            targetKind,
            brandName: e.brandName || null,
            scamType: e.scamType || null,
            reportCount: e.reportCount ?? 0,
            region: e.region || null,
            blacklistedAt: e.blacklistedAt || null,
            status: e.status || 'blacklisted',
          };
          if (targetKind === 'brand') {
            if (seenB.has(value)) continue;
            seenB.add(value);
            if (brands.length < FEED_LIMIT) brands.push(row);
          } else {
            if (seenN.has(value)) continue;
            seenN.add(value);
            if (numbers.length < FEED_LIMIT) numbers.push(row);
          }
        }

        if (gen === loadGenRef.current) {
          if (numbers.length > 0) setNumberEntries(numbers);
          if (brands.length > 0) setBrandEntries(brands);
        }
      }
    } catch (err) {
      if (err instanceof OfflineError) {
        // silent
      } else if (err?.response?.status !== 404) {
        console.warn('[HomeScreen] remote dashboard failed:', err?.message);
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

  const openDetail = useCallback(
    (entry, kind) => {
      if (!entry?.value) return;
      navigation.navigate('BlacklistDetail', {
        identifier: entry.value,
        targetKind: kind,
      });
    },
    [navigation]
  );

  const openSearchKind = useCallback(
    (kind) => {
      navigation.navigate('Search', { initialKind: kind });
    },
    [navigation]
  );

  const openSearch = useCallback(() => {
    navigation.navigate('Search');
  }, [navigation]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
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
/>

        <View>
          <SectionHeader
            theme={theme}
            title="Your Reports"
            subtitle="Track your submissions through officer review"
          />
          <View style={{ flexDirection: 'row', gap: S.sm }}>
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
            title="Blacklisted Numbers"
            subtitle={`${numberEntries.length} number${
              numberEntries.length === 1 ? '' : 's'
            } confirmed as scams`}
          />
          <LiveRegistryFeed
            theme={theme}
            kind="number"
            title="Numbers"
            subtitle="Confirmed scam numbers and SMS headers"
            emptyTitle="No confirmed scam numbers yet"
            emptyBody="Once officers confirm a number, it appears here so you can check it before answering."
            entries={numberEntries}
            onPressEntry={openDetail}
            onBrowseAll={() => openSearchKind('number')}
          />
        </View>

        <View>
          <SectionHeader
            theme={theme}
            title="Impersonated Brands"
            subtitle={`${brandEntries.length} brand${
              brandEntries.length === 1 ? '' : 's'
            } flagged for impersonation`}
          />
          <LiveRegistryFeed
            theme={theme}
            kind="brand"
            title="Brands"
            subtitle="Brands used in impersonation scams"
            emptyTitle="No impersonated brands yet"
            emptyBody="When a scam SMS pretends to be a bank, telco, or government agency, the brand appears here."
            entries={brandEntries}
            onPressEntry={openDetail}
            onBrowseAll={() => openSearchKind('brand')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}