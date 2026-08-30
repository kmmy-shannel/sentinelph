// apps/mobile/screens/SearchScreen.js
//
// Blacklist lookup: checks the local SQLite cache table first (populated
// by periodic background sync of frequently-hit entries), then falls back
// to GET /api/v1/blacklist/:number for a live authoritative check.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import * as SQLite from 'expo-sqlite';

import api, { OfflineError } from '../lib/api';

const DEBOUNCE_MS = 400;

function SearchIcon({ size = 16, color = '#475569' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.25} stroke={color} strokeWidth={1.3} />
      <Line x1={9.75} y1={9.75} x2={13.5} y2={13.5} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function Badge({ label, color }) {
  const palette = {
    rose: { text: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.25)' },
    amber: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
    emerald: { text: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  };
  const s = palette[color] || palette.amber;
  return (
    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, borderWidth: 1, borderColor: s.border }}>
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/**
 * Looks up cached blacklist entries matching `query` from the local
 * `blacklist_cache` table (mirrored via background sync — see Phase 2's
 * BlacklistEntry model). Returns [] if the table doesn't exist yet.
 */
async function searchLocalCache(query) {
  try {
    const db = await SQLite.openDatabaseAsync('sentinelph.db');
    const rows = await db.getAllAsync(
      `SELECT identifier, type, risk_level, report_count
       FROM blacklist_cache
       WHERE identifier LIKE ? LIMIT 20`,
      [`%${query}%`]
    );
    return rows.map((r) => ({
      type: r.type,
      value: r.identifier,
      risk: r.risk_level,
      reportCount: r.report_count,
      source: 'cache',
    }));
  } catch {
    return [];
  }
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const runSearch = async (q) => {
    setLoading(true);
    try {
      const cached = await searchLocalCache(q);
      if (cached.length > 0) {
        setResults(cached);
      }

      // Always attempt a live check too — cache may be stale.
      const response = await api.get(`/api/v1/blacklist/${encodeURIComponent(q)}`);
      const liveResults = response.data?.matches || [];
      setResults(liveResults.length > 0 ? liveResults : cached);
    } catch (err) {
      if (err instanceof OfflineError) {
        // Keep whatever cache results we already set.
      } else {
        console.warn('[SearchScreen] lookup failed:', err?.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <View className="flex-1 px-4 pt-3">
        <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 }}>
          SCAM NUMBER LOOKUP
        </Text>

        <View
          className="flex-row items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
          style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.15)' }}
        >
          <SearchIcon />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Number, URL, or keyword…"
            placeholderTextColor="#475569"
            style={{ flex: 1, color: '#e2e8f0', fontSize: 14 }}
          />
          {loading && <ActivityIndicator size="small" color="#4f46e5" />}
          {!loading && query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ color: '#475569', fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {results.length > 0 ? (
          <ScrollView contentContainerStyle={{ gap: 8 }}>
            {results.map((r, i) => (
              <View
                key={`${r.value}-${i}`}
                className="flex-row items-center gap-3 p-3 rounded-xl"
                style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.1)' }}
              >
                <View
                  className="w-8 h-8 rounded-lg items-center justify-center"
                  style={{ backgroundColor: r.risk === 'high' ? 'rgba(244,63,94,0.12)' : 'rgba(245,158,11,0.12)' }}
                >
                  <Text style={{ color: r.risk === 'high' ? '#f43f5e' : '#f59e0b', fontSize: 12 }}>!</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#e2e8f0', fontSize: 12, fontFamily: 'JetBrainsMono_400Regular' }} numberOfLines={1}>
                    {r.value}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 11 }}>{r.type}</Text>
                </View>
                <Badge label={r.risk === 'high' ? 'Blacklisted' : 'Under Review'} color={r.risk === 'high' ? 'rose' : 'amber'} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View className="flex-1 items-center justify-center gap-3" style={{ paddingBottom: 64 }}>
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center"
              style={{ backgroundColor: 'rgba(79,70,229,0.08)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.15)' }}
            >
              <SearchIcon size={22} color="#4f46e5" />
            </View>
            <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '500' }}>Verify before you trust</Text>
            <Text style={{ color: '#334155', fontSize: 11, textAlign: 'center', maxWidth: 200 }}>
              Look up any number, domain, or keyword against the SentinelPH blacklist
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}