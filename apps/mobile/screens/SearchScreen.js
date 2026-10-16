// apps/mobile/screens/SearchScreen.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import Svg, { Circle, Line } from 'react-native-svg';

import api, { OfflineError } from '../lib/api';
import {
  cacheBlacklistEntry,
  cacheBlacklistBulk,
  getAllBlacklistCache,
} from '../db/sqlite';
import { useTheme, spacing as S } from '../theme/ThemeContext';

const DEBOUNCE_MS = 400;
const BROWSE_LIMIT = 200;

function SearchIcon({ size = 18, color = '#64748b' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.25} stroke={color} strokeWidth={1.3} />
      <Line
        x1={9.75}
        y1={9.75}
        x2={13.5}
        y2={13.5}
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function Badge({ label, color, theme }) {
  const palette = {
    rose: { text: theme.rose, bg: theme.roseTint, border: theme.roseTintBorder },
    amber: {
      text: theme.amber,
      bg: 'rgba(245,158,11,0.12)',
      border: 'rgba(245,158,11,0.25)',
    },
    emerald: {
      text: theme.emerald,
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
    },
    slate: {
      text: theme.textDim,
      bg: 'rgba(148,163,184,0.12)',
      border: 'rgba(148,163,184,0.25)',
    },
    indigo: {
      text: theme.primarySoft,
      bg: theme.primaryTint,
      border: theme.primaryTintBorder,
    },
  };
  const s = palette[color] || palette.slate;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: s.text,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function statusToBadge(status) {
  if (status === 'blacklisted' || status === 'approved')
    return { label: 'Blacklisted', color: 'rose' };
  if (status === 'under_review') return { label: 'Under Review', color: 'amber' };
  if (status === 'pending') return { label: 'Reported', color: 'amber' };
  if (status === 'not_found' || status === 'unknown')
    return { label: 'No Record', color: 'slate' };
  return { label: 'Unknown', color: 'slate' };
}

function formatBlacklistedDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function BlacklistRow({ item, onPress, theme }) {
  const badge = statusToBadge(item.status);
  const dateStr = formatBlacklistedDate(item.blacklistedAt);
  const isBrand = item.targetKind === 'brand';

  const iconBg = isBrand
    ? theme.primaryTint
    : badge.color === 'rose'
    ? theme.roseTint
    : badge.color === 'amber'
    ? 'rgba(245,158,11,0.12)'
    : 'rgba(148,163,184,0.12)';
  const iconColor = isBrand
    ? theme.primarySoft
    : badge.color === 'rose'
    ? theme.rose
    : badge.color === 'amber'
    ? theme.amber
    : theme.textDim;

  const rowId = isBrand
    ? item.brandName || item.value
    : item.value;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: S.md,
        padding: 16,
        borderRadius: 14,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: iconBg,
          flexShrink: 0,
        }}
      >
        <Text style={{ color: iconColor, fontSize: 16, fontWeight: '700' }}>
          {isBrand ? 'B' : badge.color === 'rose' ? '!' : badge.color === 'amber' ? '…' : '?'}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isBrand ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: theme.primaryTint,
                borderWidth: 1,
                borderColor: theme.primaryTintBorder,
              }}
            >
              <Text
                style={{
                  color: theme.primarySoft,
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 0.3,
                }}
              >
                BRAND
              </Text>
            </View>
          ) : null}
          <Text
            style={{
              color: theme.text,
              fontSize: 13,
              fontFamily: 'JetBrainsMono_400Regular',
              flex: 1,
            }}
            numberOfLines={1}
          >
            {rowId}
          </Text>
        </View>
        <Text
          style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}
          numberOfLines={1}
        >
          {item.scamType
            ? `${item.scamType}${
                item.reportCount ? ` · ${item.reportCount} reports` : ''
              }`
            : isBrand
            ? `Impersonated brand · reported from ${item.value}`
            : 'Phone number / SMS header'}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: S.sm,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {item.region && item.region !== 'UNCLASSIFIED' ? (
            <Text style={{ color: theme.textFaint, fontSize: 10 }}>
              {item.region}
            </Text>
          ) : null}
          {dateStr ? (
            <Text style={{ color: theme.textFaint, fontSize: 10 }}>
              Blacklisted {dateStr}
            </Text>
          ) : null}
        </View>
      </View>

      <Badge label={badge.label} color={badge.color} theme={theme} />
    </TouchableOpacity>
  );
}

function FilterChips({ value, onChange, theme }) {
  const opts = [
    { key: 'all', label: 'All' },
    { key: 'number', label: 'Numbers' },
    { key: 'brand', label: 'Brands' },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: S.sm, marginBottom: S.md }}>
      {opts.map((o) => {
        const active = value === o.key;
        return (
          <TouchableOpacity
            key={o.key}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? theme.primaryTint : theme.surface,
              borderWidth: 1,
              borderColor: active ? theme.primaryTintBorder : theme.border,
            }}
          >
            <Text
              style={{
                color: active ? theme.primarySoft : theme.textMuted,
                fontSize: 12,
                fontWeight: '700',
              }}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function SearchScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { theme } = useTheme();

  const [query, setQuery] = useState(route.params?.initialQuery || '');
  const [kindFilter, setKindFilter] = useState(
    route.params?.initialKind === 'brand'
      ? 'brand'
      : route.params?.initialKind === 'number'
      ? 'number'
      : 'all'
  );
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (route.params?.initialQuery) setQuery(route.params.initialQuery);
    if (route.params?.initialKind) {
      setKindFilter(
        route.params.initialKind === 'brand'
          ? 'brand'
          : route.params.initialKind === 'number'
          ? 'number'
          : 'all'
      );
    }
  }, [route.params?.initialQuery, route.params?.initialKind]);

  const loadRegistry = useCallback(async () => {
    try {
      const cached = await getAllBlacklistCache(BROWSE_LIMIT);
      if (cached.length > 0) {
        setAllEntries((prev) => (prev.length === 0 ? cached : prev));
      }
    } catch (err) {
      console.warn('[SearchScreen] cache read failed:', err?.message);
    }

    try {
      const response = await api.get('/api/v1/blacklist/public', {
        params: { limit: BROWSE_LIMIT },
      });
      const entries = response.data?.data || [];
      await cacheBlacklistBulk(entries).catch(() => {});

      const normalized = entries.map((e) => ({
        value: e.phoneNumber,
        targetKind: e.targetKind === 'brand' ? 'brand' : 'number',
        brandName: e.brandName || null,
        type: 'number',
        risk:
          e.status === 'blacklisted' || e.status === 'approved'
            ? 'high'
            : e.status === 'under_review' || e.status === 'pending'
            ? 'medium'
            : 'low',
        status: e.status,
        reportCount: e.reportCount ?? 0,
        scamType: e.scamType || null,
        region: e.region || null,
        blacklistedAt: e.blacklistedAt || null,
        source: 'live',
      }));

      setAllEntries(normalized);
      setError(null);
    } catch (err) {
      if (err instanceof OfflineError) {
        if (allEntries.length === 0) {
          setError('Offline — showing cached entries only.');
        }
      } else {
        console.warn('[SearchScreen] registry load failed:', err?.message);
        setError(err?.response?.data?.message || 'Could not load registry.');
      }
    }
  }, [allEntries.length]);

  useFocusEffect(
    useCallback(() => {
      loadRegistry();
    }, [loadRegistry])
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim().toLowerCase();

    // Filter by kind first
    const byKind =
      kindFilter === 'all'
        ? allEntries
        : allEntries.filter((e) =>
            kindFilter === 'brand'
              ? e.targetKind === 'brand'
              : e.targetKind !== 'brand'
          );

    if (q.length < 2) {
      setError(null);
      return;
    }

    // Live lookup when the query looks like a phone number or header
    if (/^[\d\s\-+()]+$/.test(q) && q.replace(/\D/g, '').length >= 7) {
      debounceRef.current = setTimeout(() => runLiveLookup(q.trim()), DEBOUNCE_MS);
    }
  }, [query, allEntries, kindFilter]);

  const runLiveLookup = async (q) => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/v1/blacklist/${encodeURIComponent(q)}/status`
      );
      const data = response.data?.data;
      if (data && data.phoneNumber) {
        await cacheBlacklistEntry(data).catch(() => {});
        setAllEntries((prev) => {
          const filtered = prev.filter((c) => c.value !== data.phoneNumber);
          return [
            {
              value: data.phoneNumber,
              targetKind: data.targetKind === 'brand' ? 'brand' : 'number',
              brandName: data.brandName || null,
              type: 'number',
              risk:
                data.status === 'blacklisted' || data.status === 'approved'
                  ? 'high'
                  : data.status === 'under_review' || data.status === 'pending'
                  ? 'medium'
                  : 'low',
              status: data.status,
              reportCount: data.reportCount ?? 0,
              scamType: data.scamType || null,
              region: data.region || null,
              blacklistedAt: data.blacklistedAt || null,
              source: 'live',
            },
            ...filtered,
          ];
        });
      }
    } catch (err) {
      if (!(err instanceof OfflineError)) {
        console.warn('[SearchScreen] live lookup failed:', err?.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRegistry();
    setRefreshing(false);
  };

  const q = query.trim().toLowerCase();
  const isSearchMode = q.length >= 2;

  const visible = allEntries
    .filter((e) => {
      if (kindFilter === 'brand') return e.targetKind === 'brand';
      if (kindFilter === 'number') return e.targetKind !== 'brand';
      return true;
    })
    .filter((e) => {
      if (!isSearchMode) return true;
      return (
        (e.value || '').toLowerCase().includes(q) ||
        (e.brandName || '').toLowerCase().includes(q) ||
        (e.scamType || '').toLowerCase().includes(q)
      );
    });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: S.md,
          }}
        >
          <Text
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
            }}
          >
            {isSearchMode ? 'SEARCH RESULTS' : 'REGISTRY'}
          </Text>
          {!isSearchMode && visible.length > 0 ? (
            <Text style={{ color: theme.textFaint, fontSize: 11 }}>
              {visible.length} entries
            </Text>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 4,
            borderRadius: 14,
            marginBottom: S.md,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            minHeight: 50,
          }}
        >
          <SearchIcon size={18} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a number, SMS header, or brand…"
            placeholderTextColor={theme.textFaint}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 14,
              paddingVertical: 12,
            }}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {loading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.surfaceMuted,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FilterChips value={kindFilter} onChange={setKindFilter} theme={theme} />

        {error ? (
          <View
            style={{
              marginBottom: S.md,
              padding: 14,
              borderRadius: 12,
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(245,158,11,0.25)',
            }}
          >
            <Text style={{ color: theme.amber, fontSize: 12 }}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={visible}
          keyExtractor={(item, i) => `${item.targetKind}-${item.value}-${i}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primarySoft}
            />
          }
          contentContainerStyle={{ gap: S.sm, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <BlacklistRow
              item={item}
              theme={theme}
              onPress={() =>
                navigation.navigate('BlacklistDetail', {
                  identifier: item.value,
                  targetKind: item.targetKind,
                })
              }
            />
          )}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 60,
                paddingHorizontal: 32,
                gap: S.md,
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.primaryFaint,
                  borderWidth: 1,
                  borderColor: theme.primaryTintBorder,
                }}
              >
                <SearchIcon size={24} color={theme.primarySoft} />
              </View>
              <Text
                style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}
              >
                {isSearchMode ? 'No matching entries' : 'Registry is empty'}
              </Text>
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 12,
                  textAlign: 'center',
                  maxWidth: 260,
                  lineHeight: 18,
                }}
              >
                {isSearchMode
                  ? 'Nothing in the registry matches this query.'
                  : 'Once officers confirm a number or brand, it appears here.'}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}