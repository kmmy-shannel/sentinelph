// apps/mobile/screens/MyReportsScreen.js
//
// Lists the citizen's own report history straight from the local SQLite
// outbox (db/sqlite.js's getAllReports), so it works fully offline and
// shows pending/failed/synced status per report without an extra API call.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { getAllReports } from '../db/sqlite';
import { syncNow } from '../db/syncQueue';

function StatusBadge({ report }) {
  let label = 'Confirmed';
  let color = {
    text: '#10b981',
    bg: 'rgba(16,185,129,0.12)',
    border: 'rgba(16,185,129,0.25)',
  };

  if (!report.synced) {
    if (report.syncAttempts >= 5) {
      label = 'Failed';
      color = {
        text: '#f43f5e',
        bg: 'rgba(244,63,94,0.12)',
        border: 'rgba(244,63,94,0.25)',
      };
    } else {
      label = 'Queued';
      color = {
        text: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        border: 'rgba(245,158,11,0.25)',
      };
    }
  }

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: color.bg,
        borderWidth: 1,
        borderColor: color.border,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color: color.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}

export default function MyReportsScreen() {
  const navigation = useNavigation();
  const [reports, setReports] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const all = await getAllReports();
    setReports(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await syncNow().catch(() => {});
    await load();
    setRefreshing(false);
  };

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
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            minWidth: 60,
            paddingVertical: 4,
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#818cf8', fontSize: 13, fontWeight: '500' }}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>
          My Reports
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.localId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818cf8"
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 10,
        }}
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
              style={{
                color: '#475569',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No reports yet
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={{
              padding: 14,
              borderRadius: 12,
              backgroundColor: '#1e293b',
              borderWidth: 1,
              borderColor: 'rgba(148,163,184,0.1)',
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: '#e2e8f0',
                  fontSize: 13,
                  fontWeight: '600',
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {item.scamType}
              </Text>
              <StatusBadge report={item} />
            </View>
            <Text
              style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}
              numberOfLines={2}
            >
              {item.content}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: '#334155',
                  fontSize: 10,
                  fontFamily: 'JetBrainsMono_400Regular',
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {item.serverReportId ||
                  `LOCAL-${item.localId.slice(0, 8).toUpperCase()}`}
              </Text>
              <Text style={{ color: '#475569', fontSize: 10 }}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
            {item.lastError && !item.synced && (
              <Text
                style={{ color: '#f43f5e', fontSize: 10 }}
                numberOfLines={1}
              >
                Sync error: {item.lastError}
              </Text>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}