// apps/mobile/screens/HomeScreen.js
//
// Dashboard: threat banner, offline/sync status, quick report CTA, stat
// counters (Queued/Under Review/Confirmed), and nearby scam activity feed.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BlacklistStatusBanner from '../components/BlacklistStatusBanner';
import OfflineSyncIndicator from '../components/OfflineSyncIndicator';
import QuickReportCard from '../components/QuickReportCard';
import NearbyAlertsWidget from '../components/NearbyAlertsWidget';
import api, { OfflineError } from '../lib/api';
import { getPendingReports, getAllReports } from '../db/sqlite';

function StatCounter({ label, value, color, bg }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: `${color}25`,
      }}
    >
      <Text
        style={{
          color,
          fontSize: 20,
          fontWeight: '700',
          letterSpacing: -0.5,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text
        style={{
          color: '#64748b',
          fontSize: 9,
          fontWeight: '500',
          textAlign: 'center',
          marginTop: 2,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;

  const [refreshing, setRefreshing] = useState(false);
  const [threatLevel, setThreatLevel] = useState('safe');
  const [stats, setStats] = useState({ queued: 0, underReview: 0, confirmed: 0 });
  const [nearbyIncidents, setNearbyIncidents] = useState([]);

  const loadDashboard = useCallback(async () => {
    try {
      const [pending, all] = await Promise.all([getPendingReports(), getAllReports()]);
      const confirmed = all.filter((r) => r.synced).length;
      setStats((prev) => ({ ...prev, queued: pending.length, confirmed }));
    } catch (err) {
      console.warn('[HomeScreen] failed to read local reports:', err?.message);
    }

    try {
      const [statusRes, alertsRes] = await Promise.all([
        api.get('/api/v1/status/summary'),
        api.get('/api/v1/alerts/nearby'),
      ]);

      setThreatLevel(statusRes.data?.threatLevel || 'safe');
      setStats((prev) => ({
        ...prev,
        underReview: statusRes.data?.underReviewCount ?? prev.underReview,
      }));
      setNearbyIncidents(alertsRes.data?.incidents || []);
    } catch (err) {
      if (!(err instanceof OfflineError)) {
        console.warn('[HomeScreen] failed to load remote dashboard data:', err?.message);
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

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <BlacklistStatusBanner level={threatLevel} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
          gap: 12,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#818cf8"
          />
        }
      >
        <OfflineSyncIndicator />

        <QuickReportCard
          onQuickReport={() => navigation.navigate('ReportWizard')}
          onCameraShortcut={() =>
            navigation.navigate('ReportWizard', { openStep: 2, focus: 'camera' })
          }
          onMicShortcut={() =>
            navigation.navigate('ReportWizard', { openStep: 2, focus: 'mic' })
          }
        />

        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            marginTop: 4,
          }}
        >
          <StatCounter
            label="Queued"
            value={stats.queued}
            color="#f59e0b"
            bg="rgba(245,158,11,0.08)"
          />
          <StatCounter
            label="Under Review"
            value={stats.underReview}
            color="#818cf8"
            bg="rgba(79,70,229,0.08)"
          />
          <StatCounter
            label="Confirmed"
            value={stats.confirmed}
            color="#10b981"
            bg="rgba(16,185,129,0.08)"
          />
        </View>

        <NearbyAlertsWidget incidents={nearbyIncidents} />
      </ScrollView>
    </SafeAreaView>
  );
}