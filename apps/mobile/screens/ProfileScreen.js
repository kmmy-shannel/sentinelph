// apps/mobile/screens/ProfileScreen.js
//
// Anonymous profile: reputation stats, ZKP wallet identifier, offline
// storage controls, alert radius, and sign-out.

import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

import api, { OfflineError } from '../lib/api';
import { getAllReports, clearAllReports } from '../db/sqlite';
import { getOrCreateDeviceSecret } from '../lib/zkp/nullifierGenerator';

const RADIUS_OPTIONS = [1, 2, 5, 10]; // km

function Badge({ label, color }) {
  const palette = {
    indigo: { text: '#818cf8', bg: 'rgba(79,70,229,0.15)', border: 'rgba(79,70,229,0.3)' },
    emerald: { text: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  };
  const s = palette[color] || palette.indigo;
  return (
    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, borderWidth: 1, borderColor: s.border }}>
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, value, mono }) {
  return (
    <View
      className="flex-row items-center gap-3 px-3 py-3 rounded-xl"
      style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.1)' }}
    >
      <Text style={{ color: '#475569', fontSize: 14, width: 20, textAlign: 'center' }}>{icon}</Text>
      <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '500', flex: 1 }}>{label}</Text>
      <Text
        style={{
          color: '#475569',
          fontSize: mono ? 10 : 12,
          fontFamily: mono ? 'JetBrainsMono_400Regular' : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const [profile, setProfile] = useState({ totalReports: 0, reputationScore: 0, confirmedCount: 0 });
  const [queuedCount, setQueuedCount] = useState(0);
  const [walletId, setWalletId] = useState('');
  const [radiusKm, setRadiusKm] = useState(2);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    const all = await getAllReports();
    setQueuedCount(all.filter((r) => !r.synced).length);

    const secret = await getOrCreateDeviceSecret();
    setWalletId(`0x${secret.slice(0, 4)}…${secret.slice(-4)}`);

    try {
      const response = await api.get('/api/v1/profile/summary');
      setProfile({
        totalReports: response.data?.totalReports ?? all.length,
        reputationScore: response.data?.reputationScore ?? 0,
        confirmedCount: response.data?.confirmedCount ?? all.filter((r) => r.synced).length,
      });
      if (response.data?.alertRadiusKm) setRadiusKm(response.data.alertRadiusKm);
    } catch (err) {
      if (!(err instanceof OfflineError)) console.warn('[ProfileScreen] failed to load summary:', err?.message);
      setProfile((prev) => ({ ...prev, totalReports: all.length, confirmedCount: all.filter((r) => r.synced).length }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const updateRadius = async (km) => {
    setRadiusKm(km);
    try {
      await api.patch('/api/v1/profile/settings', { alertRadiusKm: km });
    } catch {
      // Offline-safe: local UI state already updated, will sync with next PATCH attempt.
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear offline cache?',
      'This removes all locally cached reports and blacklist data. Reports already synced to the server are unaffected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            await clearAllReports();
            setQueuedCount(0);
            setClearing(false);
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime — your anonymous reporter identity stays on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (err) {
            console.warn('[ProfileScreen] sign out failed:', err?.message);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingTop: 12, paddingBottom: 24 }}>
        <View className="items-center py-6">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center mb-3"
            style={{ backgroundColor: '#4f46e5', borderWidth: 2, borderColor: 'rgba(129,140,248,0.4)' }}
          >
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>SR</Text>
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: '600' }}>Sentinel Reporter</Text>
          <Text style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>Anonymous · Verified contributor</Text>
          <View className="flex-row items-center gap-2 mt-2">
            <Badge label={`Level ${Math.max(1, Math.floor(profile.reputationScore / 25))} Reporter`} color="indigo" />
            <Badge label={`${profile.confirmedCount} confirmed`} color="emerald" />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Row icon="◈" label="My Reports" value={`${profile.totalReports} total`} />
          <TouchableOpacity onPress={() => navigation.navigate('MyReports')}>
            <Text style={{ color: '#4f46e5', fontSize: 11, textAlign: 'right', marginTop: -4, marginBottom: 4 }}>
              View history →
            </Text>
          </TouchableOpacity>
          <Row icon="⬡" label="Reputation Score" value={`${profile.reputationScore} / 100`} />
          <Row icon="◇" label="ZKP Wallet" value={walletId} mono />
          <Row icon="◫" label="Offline Storage" value={`${queuedCount} queued`} />
          <Row icon="◉" label="Data Sharing" value="Anonymous only" />
          <Row icon="◻" label="Notifications" value="Enabled" />
        </View>

        <View style={{ marginTop: 16 }}>
          <Text style={{ color: '#475569', fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 8 }}>
            ALERT RADIUS
          </Text>
          <View className="flex-row gap-2">
            {RADIUS_OPTIONS.map((km) => {
              const active = radiusKm === km;
              return (
                <TouchableOpacity
                  key={km}
                  onPress={() => updateRadius(km)}
                  className="flex-1 py-2.5 rounded-xl items-center"
                  style={{
                    backgroundColor: active ? 'rgba(79,70,229,0.2)' : '#1e293b',
                    borderWidth: 1,
                    borderColor: active ? 'rgba(79,70,229,0.5)' : 'rgba(148,163,184,0.1)',
                  }}
                >
                  <Text style={{ color: active ? '#818cf8' : '#94a3b8', fontSize: 12, fontWeight: '500' }}>{km} km</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleClearCache}
          disabled={clearing}
          className="mt-4 py-3 rounded-xl items-center"
          style={{ backgroundColor: 'rgba(148,163,184,0.08)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.15)' }}
        >
          {clearing ? <ActivityIndicator color="#94a3b8" /> : (
            <Text style={{ color: '#94a3b8', fontSize: 13, fontWeight: '500' }}>Clear Offline Cache</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          className="mt-3 py-3 rounded-xl items-center"
          style={{ backgroundColor: 'rgba(244,63,94,0.08)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.2)' }}
        >
          <Text style={{ color: '#f43f5e', fontSize: 13, fontWeight: '500' }}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}