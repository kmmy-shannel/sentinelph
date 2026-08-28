import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, RefreshControl } from 'react-native';
import { Bell, MapPin, TriangleAlert } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { fetchNearbyAlerts } from '../services/api';

const FALLBACK_ALERTS = [
  { id: 'a1', title: 'Fake bank verification call', location: 'Brgy. Poblacion, Makati City', distanceKm: 0.8, severity: 'high', reportedAt: '2 hours ago' },
  { id: 'a2', title: 'SMS phishing - fake courier fee', location: 'Brgy. San Antonio, Makati City', distanceKm: 1.4, severity: 'medium', reportedAt: '5 hours ago' },
  { id: 'a3', title: 'Impersonation - fake government hotline', location: 'Brgy. Bel-Air, Makati City', distanceKm: 2.1, severity: 'medium', reportedAt: 'Yesterday' },
  { id: 'a4', title: 'Fake lottery / prize notification', location: 'Brgy. Guadalupe Nuevo, Makati City', distanceKm: 3.0, severity: 'low', reportedAt: '2 days ago' },
];

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState(FALLBACK_ALERTS);
  const [refreshing, setRefreshing] = useState(false);

  const loadAlerts = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlerts(FALLBACK_ALERTS);
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const data = await fetchNearbyAlerts(position.coords.latitude, position.coords.longitude, 10);
      setAlerts(Array.isArray(data) && data.length > 0 ? data : FALLBACK_ALERTS);
    } catch (error) {
      setAlerts(FALLBACK_ALERTS);
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

  const severityColor = (severity) => {
    if (severity === 'high') return { bg: 'bg-red-100', icon: '#DC2626' };
    if (severity === 'low') return { bg: 'bg-slate-100', icon: '#64748B' };
    return { bg: 'bg-amber-100', icon: '#B45309' };
  };

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-5 pt-14 pb-4 bg-white border-b border-slate-100 flex-row items-center">
        <Bell size={20} color="#1E3A8A" />
        <Text className="text-slate-900 text-2xl font-bold ml-2">Alerts</Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E3A8A" />}
        renderItem={({ item }) => {
          const colors = severityColor(item.severity);
          return (
            <View className="bg-white rounded-2xl border border-slate-100 p-4 mb-3 flex-row">
              <View className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${colors.bg}`}>
                <TriangleAlert size={18} color={colors.icon} />
              </View>
              <View className="flex-1">
                <Text className="text-slate-900 font-semibold text-sm">{item.title}</Text>
                <View className="flex-row items-center mt-1.5">
                  <MapPin size={12} color="#94A3B8" />
                  <Text className="text-slate-400 text-xs ml-1">
                    {item.location} · {item.distanceKm} km
                  </Text>
                </View>
                <Text className="text-slate-300 text-[11px] mt-1">{item.reportedAt}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center py-10">
            <Text className="text-slate-400 text-sm">No alerts near you right now.</Text>
          </View>
        }
      />
    </View>
  );
}