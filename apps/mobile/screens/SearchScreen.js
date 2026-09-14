// apps/mobile/screens/SearchScreen.js
//
// Blacklist lookup: checks the local SQLite cache table first (populated
// by periodic background sync of frequently-hit entries), then falls back
// to GET /api/v1/blacklist/:number for a live authoritative check.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import * as SQLite from 'expo-sqlite';

import api, { OfflineError } from '../lib/api';

const DEBOUNCE_MS = 400;

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
  };
  const s = palette[color] || palette.amber;
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
  const { width } = useWindowDimensions();
  const isWide = width >= 480;

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
    debounceRef.current = setTimeout(
      () => runSearch(query.trim()),
      DEBOUNCE_MS
    );
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const runSearch = async (q) => {
    setLoading(true);
    try {
      const cached = await searchLocalCache(q);
      if (cached.length > 0) {
        setResults(cached);
      }

      const response = await api.get(
        `/api/v1/blacklist/${encodeURIComponent(q)}`
      );
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
        <Text
          style={{
            color: '#475569',
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 1,
            marginBottom: 12,
          }}
        >
          SCAM NUMBER LOOKUP
        </Text>

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
            placeholder="Number, URL, or keyword…"
            placeholderTextColor="#475569"
            style={{
              flex: 1,
              color: '#e2e8f0',
              fontSize: 14,
              paddingVertical: 2,
            }}
            autoCorrect={false}
            autoCapitalize="none"
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

        {results.length > 0 ? (
          <ScrollView
            contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {results.map((r, i) => (
              <View
                key={`${r.value}-${i}`}
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
                      r.risk === 'high'
                        ? 'rgba(244,63,94,0.12)'
                        : 'rgba(245,158,11,0.12)',
                    flexShrink: 0,
                  }}
                >
                  <Text
                    style={{
                      color: r.risk === 'high' ? '#f43f5e' : '#f59e0b',
                      fontSize: 14,
                      fontWeight: '700',
                    }}
                  >
                    !
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
                    {r.value}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>
                    {r.type}
                  </Text>
                </View>
                <Badge
                  label={r.risk === 'high' ? 'Blacklisted' : 'Under Review'}
                  color={r.risk === 'high' ? 'rose' : 'amber'}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              paddingBottom: 64,
              paddingHorizontal: 32,
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
              Verify before you trust
            </Text>
            <Text
              style={{
                color: '#334155',
                fontSize: 11,
                textAlign: 'center',
                maxWidth: 240,
                lineHeight: 16,
              }}
            >
              Look up any number, domain, or keyword against the SentinelPH
              blacklist
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}