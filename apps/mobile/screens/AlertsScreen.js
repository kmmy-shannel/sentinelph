// apps/mobile/screens/AlertsScreen.js
//
// Feed of geofenced scam alerts + personal report-status notifications,
// sourced from GET /api/v1/alerts/nearby. Falls back gracefully offline
// (shows last-fetched list, no crash).

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import api, { OfflineError } from '../lib/api';

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

function levelToBadge(level) {
  if (level === 'high') return { label: 'High Alert', color: 'rose' };
  if (level === 'moderate') return { label: 'Under Review', color: 'amber' };
  return { label: 'Confirmed', color: 'emerald' };
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const response = await api.get('/api/v1/alerts/nearby');
      setAlerts(response.data?.alerts || []);
    } catch (err) {
      if (!(err instanceof OfflineError)) {
        console.warn('[AlertsScreen] failed to load alerts:', err?.message);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  };

  const markAsRead = async (id) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
    try {
      await api.patch(`/api/v1/alerts/${id}/read`);
    } catch {
      // Best-effort.
    }
  };

  const markAllRead = async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    try {
      await api.post('/api/v1/alerts/mark-all-read');
    } catch {
      // Best-effort.
    }
  };

  const unread = alerts.filter((a) => !a.read).length;

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
          gap: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexShrink: 1,
          }}
        >
          <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>
            Alerts
          </Text>
          {unread > 0 && (
            <View
              style={{
                minWidth: 18,
                height: 18,
                paddingHorizontal: 5,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f43f5e',
              }}
            >
              <Text
                style={{ fontSize: 10, color: 'white', fontWeight: '700' }}
              >
                {unread}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={markAllRead}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#4f46e5', fontSize: 12, fontWeight: '500' }}>
            Mark all read
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818cf8"
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
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
              No alerts yet
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const badge = levelToBadge(item.level);
          return (
            <TouchableOpacity
              onPress={() => markAsRead(item.id)}
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(148,163,184,0.07)',
                backgroundColor: item.read
                  ? 'transparent'
                  : 'rgba(79,70,229,0.04)',
              }}
              activeOpacity={0.7}
            >
              <View style={{ paddingTop: 5 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: item.read ? 'transparent' : '#818cf8',
                  }}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      color: item.read ? '#64748b' : '#e2e8f0',
                      fontSize: 13,
                      fontWeight: '600',
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 10 }}>
                    {item.time}
                  </Text>
                </View>
                <Text
                  style={{ color: '#475569', fontSize: 11, lineHeight: 16 }}
                >
                  {item.body}
                </Text>
                <View style={{ marginTop: 8 }}>
                  <Badge label={badge.label} color={badge.color} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}