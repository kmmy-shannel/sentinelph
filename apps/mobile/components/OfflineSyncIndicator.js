// apps/mobile/components/OfflineSyncIndicator.js
//
// Pill row shown near the top of HomeScreen: connectivity dot + label,
// last-sync timestamp, and a manual "Sync Now" affordance. Wires directly
// into db/syncQueue.js so it reflects real sync state rather than mocked
// values like the Figma Make prototype's static "Synced 09:41 UTC+8".

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { syncNow, subscribeSyncStatus } from '../db/syncQueue';
import { getPendingReports } from '../db/sqlite';

function formatTime(dateIso) {
  if (!dateIso) return '—';
  const d = new Date(dateIso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} UTC+8`;
}

export default function OfflineSyncIndicator() {
  const [isConnected, setIsConnected] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshQueueCount = useCallback(async () => {
    try {
      const pending = await getPendingReports();
      setQueuedCount(pending.length);
    } catch (err) {
      console.warn('[OfflineSyncIndicator] failed to read outbox:', err?.message);
    }
  }, []);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      setIsConnected(Boolean(state.isConnected && state.isInternetReachable !== false));
    });

    const unsubStatus = subscribeSyncStatus((status) => {
      if (status.phase === 'syncing') setSyncing(true);
      if (status.phase === 'idle') {
        setSyncing(false);
        setLastSyncedAt(status.lastSyncedAt);
        refreshQueueCount();
      }
      if (status.phase === 'offline') setSyncing(false);
    });

    refreshQueueCount();

    return () => {
      unsubNet();
      unsubStatus();
    };
  }, [refreshQueueCount]);

  const handleSyncNow = async () => {
    if (syncing || !isConnected) return;
    setSyncing(true);
    try {
      await syncNow();
    } finally {
      setSyncing(false);
      refreshQueueCount();
    }
  };

  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-1.5">
        <View
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: isConnected ? '#10b981' : '#f59e0b' }}
        />
        <Text
          style={{ color: isConnected ? '#10b981' : '#f59e0b', fontSize: 12, fontWeight: '500' }}
        >
          {isConnected
            ? 'Online'
            : `Offline${queuedCount > 0 ? ` — ${queuedCount} queued` : ''}`}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSyncNow}
        disabled={syncing || !isConnected}
        className="flex-row items-center gap-1.5"
        activeOpacity={0.7}
      >
        {syncing ? (
          <ActivityIndicator size="small" color="#818cf8" />
        ) : (
          <Text
            style={{
              color: isConnected ? '#818cf8' : '#334155',
              fontSize: 10,
              fontFamily: 'JetBrainsMono_400Regular',
            }}
          >
            {isConnected ? 'Sync Now' : `Synced ${formatTime(lastSyncedAt)}`}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}