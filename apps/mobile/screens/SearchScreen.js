// apps/mobile/screens/SearchScreen.js
//
// Blacklist registry + lookup. Two modes, one screen:
//
//   BROWSE MODE (default)
//     Shows every cached blacklisted entry — no query required. Refreshed
//     on focus from GET /api/v1/blacklist/public (citizen-safe). Works
//     offline against the local blacklist_cache table.
//
//   SEARCH MODE (typing)
//     Filters the cached list in real time (LIKE query). Also fires a
//     live lookup for the exact identifier via
//     GET /api/v1/blacklist/:id/status to catch entries that aren't in
//     cache yet.
//
// Route params:
//   initialQuery (string) — pre-fill the search box. Used by HomeScreen's
//   Live Registry Feed: tapping a row navigates here with that number.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import Svg, { Circle, Line } from 'react-native-svg';

import api, { OfflineError } from '../lib/api';
import {
  cacheBlacklistEntry,
  cacheBlacklistBulk,
  getAllBlacklistCache,
  searchBlacklistCache,
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
    rose: {
      text: theme.rose,
      bg: theme.roseTint,
      border: theme.roseTintBorder,
    },
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
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

function statusToBadge(status) {
  if (status === 'blacklisted' || status === 'approved') {
    return { label: 'Blacklisted', color: 'rose' };
  }
  if (status === 'under_review') {
    return { label: 'Under Review', color: 'amber' };
  }
  if (status === 'pending') {
    return { label: 'Reported', color: 'amber' };
  }
  if (status === 'not_found' || status === 'unknown') {
    return { label: 'No Record', color: 'slate' };
  }
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

function BlacklistRow({ item, theme }) {
  const badge = statusToBadge(item.status);
  const dateStr = formatBlacklistedDate(item.blacklistedAt);

  const iconBg =
    badge.color === 'rose'
      ? theme.roseTint
      : badge.color === 'amber'
      ? 'rgba(245,158,11,0.12)'
      : 'rgba(148,163,184,0.12)';
  const iconColor =
    badge.color === 'rose'
      ? theme.rose
      : badge.color === 'amber'
      ? theme.amber
      : theme.textDim;

  return (
    <View
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
          {badge.color === 'rose' ? '!' : badge.color === 'amber' ? '…' : '?'}
        </Text>
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
          {item.value}
        </Text>
        <Text
          style={{ color: theme.textMuted, fontSize: 11, marginTop: 3 }}
          numberOfLines={1}
        >
          {item.scamType
            ? `${item.scamType}${item.reportCount ? ` · ${item.reportCount} reports` : ''}`
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
          {item.region && item.region !== 'UNCLASSIFIED' && (
            <Text style={{ color: theme.textFaint, fontSize: 10 }}>
              {item.region}
            </Text>
          )}
          {dateStr && (
            <Text style={{ color: theme.textFaint, fontSize: 10 }}>
              Blacklisted {dateStr}
            </Text>
          )}
        </View>
      </View>

      <Badge label={badge.label} color={badge.color} theme={theme} />
    </View>
  );
}

export default function SearchScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 480;
  const route = useRoute();
  const { theme } = useTheme();

  const [query, setQuery] = useState(route.params?.initialQuery || '');
  const [allEntries, setAllEntries] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (route.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route.params?.initialQuery]);

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
    const q = query.trim();

    if (q.length < 2) {
      setResults(allEntries);
      setError(null);
      return;
    }

    const lower = q.toLowerCase();
    const local = allEntries.filter(
      (e) =>
        (e.value || '').toLowerCase().includes(lower) ||
        (e.scamType || '').toLowerCase().includes(lower)
    );
    setResults(local);

    debounceRef.current = setTimeout(() => runLiveLookup(q, local), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, allEntries]);

  const runLiveLookup = async (q, local) => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/v1/blacklist/${encodeURIComponent(q)}/status`
      );
      const data = response.data?.data;

      if (data && data.phoneNumber) {
        await cacheBlacklistEntry(data).catch(() => {});

        const live = {
          value: data.phoneNumber,
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
        };

        const merged = [live, ...local.filter((c) => c.value !== live.value)];
        setResults(merged);
      } else if (local.length === 0) {
        setResults([
          {
            value: q,
            type: 'number',
            risk: 'low',
            status: 'not_found',
            reportCount: 0,
            scamType: null,
            region: null,
            blacklistedAt: null,
            source: 'live',
          },
        ]);
      }
    } catch (err) {
      if (err instanceof OfflineError) {
        if (local.length === 0) {
          setError('Offline — no cached match for this identifier.');
        }
      } else if (err?.response?.status === 404) {
        if (local.length === 0) {
          setResults([
            {
              value: q,
              type: 'number',
              risk: 'low',
              status: 'not_found',
              reportCount: 0,
              scamType: null,
              region: null,
              blacklistedAt: null,
              source: 'live',
            },
          ]);
        }
      } else {
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

  const isSearchMode = query.trim().length >= 2;
  const listData = isSearchMode ? results : allEntries;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
          maxWidth: isWide ? 720 : undefined,
          alignSelf: isWide ? 'center' : 'stretch',
          width: '100%',
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
            {isSearchMode ? 'SEARCH RESULTS' : 'BLACKLIST REGISTRY'}
          </Text>
          {!isSearchMode && allEntries.length > 0 && (
            <Text style={{ color: theme.textFaint, fontSize: 11 }}>
              {allEntries.length} entries
            </Text>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 4,
            borderRadius: 14,
            marginBottom: S.lg,
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
            placeholder="Search a number or SMS header…"
            placeholderTextColor={theme.textFaint}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 14,
              paddingVertical: 12,
            }}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="default"
          />
          {loading && <ActivityIndicator size="small" color={theme.primary} />}
          {!loading && query.length > 0 && (
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
          )}
        </View>

        {error && (
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
        )}

        <FlatList
          data={listData}
          keyExtractor={(item, i) => `${item.value}-${i}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primarySoft}
            />
          }
          contentContainerStyle={{ gap: S.sm, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <BlacklistRow item={item} theme={theme} />}
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
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
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
                  ? 'Nothing in the blacklist matches this query.'
                  : 'Once officers confirm a number as a scam, it appears here.'}
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}