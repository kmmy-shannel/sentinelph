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
//
// Citizen-safe statuses returned by the server:
//   not_found     → grey "No Record"
//   pending       → amber "Reported"
//   under_review  → amber "Under Review"
//   blacklisted   → red   "Blacklisted"
//   approved      → red   "Blacklisted" (legacy alias)

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

const DEBOUNCE_MS = 400;
const BROWSE_LIMIT = 200;

function SearchIcon({ size = 16, color = '#475569' }) {
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

function Badge({ label, color }) {
  const palette = {
    rose: { text: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.25)' },
    amber: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    emerald: { text: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
    slate: { text: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' },
  };
  const s = palette[color] || palette.slate;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function statusToBadge(status) {
  if (status === 'blacklisted' || status === 'approved') {
    return { label: 'Blacklisted', color: 'rose', icon: '!' };
  }
  if (status === 'under_review') {
    return { label: 'Under Review', color: 'amber', icon: '…' };
  }
  if (status === 'pending') {
    return { label: 'Reported', color: 'amber', icon: '…' };
  }
  if (status === 'not_found' || status === 'unknown') {
    return { label: 'No Record', color: 'slate', icon: '?' };
  }
  return { label: 'Unknown', color: 'slate', icon: '?' };
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

// ─── Row component ────────────────────────────────────────────────────
function BlacklistRow({ item }) {
  const badge = statusToBadge(item.status);
  const dateStr = formatBlacklistedDate(item.blacklistedAt);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.1)',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor:
            badge.color === 'rose'
              ? 'rgba(244,63,94,0.12)'
              : badge.color === 'amber'
              ? 'rgba(245,158,11,0.12)'
              : 'rgba(148,163,184,0.12)',
          flexShrink: 0,
        }}
      >
        <Text
          style={{
            color:
              badge.color === 'rose'
                ? '#f43f5e'
                : badge.color === 'amber'
                ? '#f59e0b'
                : '#94a3b8',
            fontSize: 14,
            fontWeight: '700',
          }}
        >
          {badge.icon}
        </Text>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: '#e2e8f0',
            fontSize: 12,
            fontFamily: 'JetBrainsMono_400Regular',
          }}
          numberOfLines={1}
        >
          {item.value}
        </Text>
        <Text
          style={{ color: '#475569', fontSize: 11, marginTop: 2 }}
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
            gap: 8,
            marginTop: 3,
            flexWrap: 'wrap',
          }}
        >
          {item.region && item.region !== 'UNCLASSIFIED' && (
            <Text style={{ color: '#334155', fontSize: 10 }}>
              {item.region}
            </Text>
          )}
          {dateStr && (
            <Text style={{ color: '#334155', fontSize: 10 }}>
              Blacklisted {dateStr}
            </Text>
          )}
        </View>
      </View>

      <Badge label={badge.label} color={badge.color} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────
export default function SearchScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 480;
  const route = useRoute();

  // Initialize from route.params.initialQuery if present (HomeScreen's
  // Live Registry Feed passes the tapped number here).
  const [query, setQuery] = useState(route.params?.initialQuery || '');
  const [allEntries, setAllEntries] = useState([]); // full list (browse mode)
  const [results, setResults] = useState([]); // search-mode results
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  // Sync the search box if the screen is already mounted and receives a
  // new initialQuery (e.g. Home → Search → back → Home → Search again).
  useEffect(() => {
    if (route.params?.initialQuery) {
      setQuery(route.params.initialQuery);
    }
  }, [route.params?.initialQuery]);

  // ─── Load: pull public registry from server, refresh cache, and
  //     populate the browse-mode list from cache.
  const loadRegistry = useCallback(async () => {
    // 1. Serve cache immediately so the list is populated on first paint.
    try {
      const cached = await getAllBlacklistCache(BROWSE_LIMIT);
      if (cached.length > 0) {
        setAllEntries((prev) => (prev.length === 0 ? cached : prev));
      }
    } catch (err) {
      console.warn('[SearchScreen] cache read failed:', err?.message);
    }

    // 2. Pull live public registry from the server, cache it, and use it.
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

  // ─── Search-mode: when query is non-empty, filter + fire live lookup.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const q = query.trim();

    if (q.length < 2) {
      // Back to browse mode.
      setResults(allEntries);
      setError(null);
      return;
    }

    // Filter the cached list immediately so the user sees instant feedback.
    const lower = q.toLowerCase();
    const local = allEntries.filter(
      (e) =>
        (e.value || '').toLowerCase().includes(lower) ||
        (e.scamType || '').toLowerCase().includes(lower)
    );
    setResults(local);

    // Then debounce the live exact-identifier lookup.
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

        // Merge: live result wins over any cached row for the same value.
        const merged = [live, ...local.filter((c) => c.value !== live.value)];
        setResults(merged);
      } else if (local.length === 0) {
        // Definitive "no record" answer for this exact identifier.
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 12,
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
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: '#475569',
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1,
            }}
          >
            {isSearchMode ? 'SEARCH RESULTS' : 'BLACKLIST REGISTRY'}
          </Text>
          {!isSearchMode && allEntries.length > 0 && (
            <Text style={{ color: '#334155', fontSize: 10 }}>
              {allEntries.length} entries
            </Text>
          )}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            marginBottom: 16,
            backgroundColor: '#1e293b',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.15)',
          }}
        >
          <SearchIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search a number or SMS header…"
            placeholderTextColor="#475569"
            style={{
              flex: 1,
              color: '#e2e8f0',
              fontSize: 14,
              paddingVertical: 2,
            }}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="default"
          />
          {loading && <ActivityIndicator size="small" color="#4f46e5" />}
          {!loading && query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={{ color: '#475569', fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {error && (
          <View
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              backgroundColor: 'rgba(245,158,11,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(245,158,11,0.25)',
            }}
          >
            <Text style={{ color: '#f59e0b', fontSize: 11 }}>{error}</Text>
          </View>
        )}

        <FlatList
          data={listData}
          keyExtractor={(item, i) => `${item.value}-${i}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#818cf8"
            />
          }
          contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <BlacklistRow item={item} />}
          ListEmptyComponent={
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingTop: 80,
                paddingHorizontal: 32,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(79,70,229,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(79,70,229,0.15)',
                }}
              >
                <SearchIcon size={22} color="#4f46e5" />
              </View>
              <Text
                style={{ color: '#64748b', fontSize: 14, fontWeight: '500' }}
              >
                {isSearchMode ? 'No matching entries' : 'Registry is empty'}
              </Text>
              <Text
                style={{
                  color: '#334155',
                  fontSize: 11,
                  textAlign: 'center',
                  maxWidth: 260,
                  lineHeight: 16,
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