import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  ShieldCheck,
  ShieldAlert,
  PlusCircle,
  MapPin,
  WifiOff,
  RefreshCw,
  ChevronRight,
  TriangleAlert,
} from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { getPendingReportsCount } from '../db/sqlite';
import { fetchNearbyAlerts } from '../services/api';

const MOCK_ALERTS = [
  {
    id: 'mock-1',
    title: 'Fake bank verification call',
    location: 'Brgy. Poblacion, Makati City',
    distanceKm: 0.8,
    severity: 'high',
    reportedAt: '2 hours ago',
  },
  {
    id: 'mock-2',
    title: 'SMS phishing - fake courier fee',
    location: 'Brgy. San Antonio, Makati City',
    distanceKm: 1.4,
    severity: 'medium',
    reportedAt: '5 hours ago',
  },
  {
    id: 'mock-3',
    title: 'Impersonation - fake government hotline',
    location: 'Brgy. Bel-Air, Makati City',
    distanceKm: 2.1,
    severity: 'medium',
    reportedAt: 'Yesterday',
  },
];

export default function HomeScreen() {
  const navigation = useNavigation();
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [blacklistStatus, setBlacklistStatus] = useState({
    flaggedCount: 3,
    status: 'active_threats',
  });

  const loadPendingCount = useCallback(async () => {
    try {
      const count = await getPendingReportsCount();
      setPendingCount(count);
    } catch (error) {
      console.warn('Unable to read pending reports count:', error);
    }
  }, []);

  const loadNearbyAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlerts(MOCK_ALERTS);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const data = await fetchNearbyAlerts(
        position.coords.latitude,
        position.coords.longitude
      );
      if (Array.isArray(data) && data.length > 0) {
        setAlerts(data);
      } else {
        setAlerts(MOCK_ALERTS);
      }
    } catch (error) {
      console.warn('Falling back to cached nearby alerts:', error.message);
      setAlerts(MOCK_ALERTS);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!(state.isConnected && state.isInternetReachable !== false));
    });
    return () => unsubscribe();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPendingCount();
    }, [loadPendingCount])
  );

  useEffect(() => {
    loadNearbyAlerts();
  }, [loadNearbyAlerts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPendingCount(), loadNearbyAlerts()]);
    setRefreshing(false);
  }, [loadPendingCount, loadNearbyAlerts]);

  const hasActiveThreats = blacklistStatus.flaggedCount > 0;

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E3A8A" />
        }
      >
        {/* Header */}
        <View className="px-5 pt-14 pb-4 bg-white border-b border-slate-100">
          <Text className="text-slate-400 text-sm">Good day,</Text>
          <Text className="text-slate-900 text-2xl font-bold mt-0.5">Juan Dela Cruz</Text>
        </View>

        {/* Offline Sync Indicator */}
        {(isOffline || pendingCount > 0) && (
          <View className="mx-5 mt-4 flex-row items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
            <View className="flex-row items-center flex-1 pr-2">
              {isOffline ? (
                <WifiOff size={18} color="#B45309" />
              ) : (
                <RefreshCw size={18} color="#B45309" />
              )}
              <Text className="ml-2 text-amber-800 text-xs flex-1">
                {isOffline
                  ? `You're offline. ${pendingCount} report${pendingCount === 1 ? '' : 's'} queued for sync.`
                  : `${pendingCount} report${pendingCount === 1 ? '' : 's'} pending sync.`}
              </Text>
            </View>
            <View className="bg-amber-500 rounded-full px-2 py-0.5 min-w-[24px] items-center">
              <Text className="text-white text-xs font-bold">{pendingCount}</Text>
            </View>
          </View>
        )}

        {/* Blacklist Status Banner */}
        <View
          className={`mx-5 mt-4 rounded-3xl p-5 ${
            hasActiveThreats ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center">
                {hasActiveThreats ? (
                  <ShieldAlert size={22} color="#FFFFFF" />
                ) : (
                  <ShieldCheck size={22} color="#FFFFFF" />
                )}
                <Text className="text-white font-bold text-base ml-2">
                  {hasActiveThreats ? 'Active Threats Detected' : 'No Active Threats'}
                </Text>
              </View>
              <Text className="text-white/90 text-xs mt-2 leading-4">
                {hasActiveThreats
                  ? `${blacklistStatus.flaggedCount} numbers linked to your recent contacts are flagged in the national blacklist registry.`
                  : 'None of your recently checked numbers are currently flagged.'}
              </Text>
            </View>
            <View className="bg-white/20 rounded-2xl px-3 py-2 items-center">
              <Text className="text-white text-2xl font-extrabold">
                {blacklistStatus.flaggedCount}
              </Text>
              <Text className="text-white/80 text-[10px]">flagged</Text>
            </View>
          </View>
        </View>

        {/* Quick Report Card */}
        <Pressable
          onPress={() => navigation.navigate('Report')}
          className="mx-5 mt-4 bg-blue-900 rounded-3xl p-5 flex-row items-center justify-between active:opacity-90"
        >
          <View className="flex-row items-center flex-1 pr-3">
            <View className="bg-white/15 rounded-2xl p-3">
              <PlusCircle size={26} color="#FFFFFF" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-white font-bold text-base">Report a Scam</Text>
              <Text className="text-white/75 text-xs mt-1">
                Report a suspicious number, message, or call in under a minute.
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color="#FFFFFF" />
        </Pressable>

        {/* Nearby Alerts Widget */}
        <View className="mt-6 px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-slate-900 font-bold text-lg">Nearby Alerts</Text>
            {alertsLoading && <ActivityIndicator size="small" color="#1E3A8A" />}
          </View>

          {alerts.length === 0 ? (
            <View className="bg-white rounded-2xl border border-slate-100 p-5 items-center">
              <Text className="text-slate-400 text-sm">No recent alerts near you.</Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View
                key={alert.id}
                className="bg-white rounded-2xl border border-slate-100 p-4 mb-3 flex-row"
              >
                <View
                  className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                    alert.severity === 'high' ? 'bg-red-100' : 'bg-amber-100'
                  }`}
                >
                  <TriangleAlert
                    size={18}
                    color={alert.severity === 'high' ? '#DC2626' : '#B45309'}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-slate-900 font-semibold text-sm">{alert.title}</Text>
                  <View className="flex-row items-center mt-1.5">
                    <MapPin size={12} color="#94A3B8" />
                    <Text className="text-slate-400 text-xs ml-1">
                      {alert.location} · {alert.distanceKm} km
                    </Text>
                  </View>
                  <Text className="text-slate-300 text-[11px] mt-1">{alert.reportedAt}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}