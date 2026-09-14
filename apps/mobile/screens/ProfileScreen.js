// apps/mobile/screens/ProfileScreen.js
//
// Anonymous profile: reputation stats, ZKP wallet identifier, offline
// storage controls, alert radius, and sign-out.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

import api, { OfflineError } from '../lib/api';
import { getAllReports, clearAllReports } from '../db/sqlite';
import { getOrCreateDeviceSecret } from '../lib/zkp/nullifierGenerator';
import { PH_REGIONS, UNCLASSIFIED_REGION } from '../lib/regionResolver';

const RADIUS_OPTIONS = [1, 2, 5, 10];

function Badge({ label, color }) {
  const palette = {
    indigo: { text: '#818cf8', bg: 'rgba(79,70,229,0.15)', border: 'rgba(79,70,229,0.3)' },
    emerald: { text: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  };
  const s = palette[color] || palette.indigo;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
      }}
    >
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

function Row({ icon, label, value, mono }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.1)',
      }}
    >
      <Text
        style={{
          color: '#475569',
          fontSize: 14,
          width: 20,
          textAlign: 'center',
        }}
      >
        {icon}
      </Text>
      <Text
        style={{
          color: '#e2e8f0',
          fontSize: 13,
          fontWeight: '500',
          flex: 1,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          color: '#475569',
          fontSize: mono ? 10 : 12,
          fontFamily: mono ? 'JetBrainsMono_400Regular' : undefined,
          flexShrink: 0,
          textAlign: 'right',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const isWide = width >= 480;

  const [profile, setProfile] = useState({
    totalReports: 0,
    reputationScore: 0,
    confirmedCount: 0,
  });
  const [queuedCount, setQueuedCount] = useState(0);
  const [walletId, setWalletId] = useState('');
  const [radiusKm, setRadiusKm] = useState(2);
  const [clearing, setClearing] = useState(false);
  const [region, setRegion] = useState(UNCLASSIFIED_REGION);

  const load = useCallback(async () => {
    const all = await getAllReports();
    setQueuedCount(all.filter((r) => !r.synced).length);

    const secret = await getOrCreateDeviceSecret();
    setWalletId(`0x${secret.slice(0, 4)}…${secret.slice(-4)}`);

    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const storedRegion = await AsyncStorage.getItem('@sentinelph_user_region');
      if (storedRegion) setRegion(storedRegion);
    } catch (err) {
      console.warn('[ProfileScreen] failed to read region:', err?.message);
    }

    try {
      const response = await api.get('/api/v1/profile/summary');
      setProfile({
        totalReports: response.data?.totalReports ?? all.length,
        reputationScore: response.data?.reputationScore ?? 0,
        confirmedCount:
          response.data?.confirmedCount ??
          all.filter((r) => r.synced).length,
      });
      if (response.data?.alertRadiusKm) setRadiusKm(response.data.alertRadiusKm);
    } catch (err) {
      if (!(err instanceof OfflineError))
        console.warn('[ProfileScreen] failed to load summary:', err?.message);
      setProfile((prev) => ({
        ...prev,
        totalReports: all.length,
        confirmedCount: all.filter((r) => r.synced).length,
      }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const setUserRegion = async (value) => {
    setRegion(value);
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('@sentinelph_user_region', value);
    } catch (err) {
      console.warn('[ProfileScreen] failed to persist region:', err?.message);
    }
  };

  const updateRadius = async (km) => {
    setRadiusKm(km);
    try {
      await api.patch('/api/v1/profile/settings', { alertRadiusKm: km });
    } catch {
      // Offline-safe.
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
    Alert.alert(
      'Sign out?',
      'You can sign back in anytime — your anonymous reporter identity stays on this device.',
      [
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
      ]
    );
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#0a1120' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 32,
          maxWidth: isWide ? 720 : undefined,
          alignSelf: isWide ? 'center' : 'stretch',
          width: '100%',
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            alignItems: 'center',
            paddingVertical: 20,
            gap: 6,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#4f46e5',
              borderWidth: 2,
              borderColor: 'rgba(129,140,248,0.4)',
              marginBottom: 6,
            }}
          >
            <Text style={{ color: 'white', fontSize: 20, fontWeight: '700' }}>
              SR
            </Text>
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 15, fontWeight: '600' }}>
            Sentinel Reporter
          </Text>
          <Text style={{ color: '#475569', fontSize: 11 }}>
            Anonymous · Verified contributor
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 6,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Badge
              label={`Level ${Math.max(
                1,
                Math.floor(profile.reputationScore / 25)
              )} Reporter`}
              color="indigo"
            />
            <Badge
              label={`${profile.confirmedCount} confirmed`}
              color="emerald"
            />
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Row
            icon="◈"
            label="My Reports"
            value={`${profile.totalReports} total`}
          />
          <TouchableOpacity
            onPress={() => navigation.navigate('MyReports')}
            style={{ alignSelf: 'flex-end', paddingVertical: 2 }}
          >
            <Text
              style={{
                color: '#4f46e5',
                fontSize: 11,
                fontWeight: '600',
              }}
            >
              View history →
            </Text>
          </TouchableOpacity>
          <Row
            icon="⬡"
            label="Reputation Score"
            value={`${profile.reputationScore} / 100`}
          />
          <Row icon="◇" label="ZKP Wallet" value={walletId} mono />
          <Row
            icon="◫"
            label="Offline Storage"
            value={`${queuedCount} queued`}
          />
          <Row icon="◎" label="Your Region" value={region} />
          <Row icon="◉" label="Data Sharing" value="Anonymous only" />
          <Row icon="◻" label="Notifications" value="Enabled" />
        </View>

        <View>
          <Text
            style={{
              color: '#475569',
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            ALERT RADIUS
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {RADIUS_OPTIONS.map((km) => {
              const active = radiusKm === km;
              return (
                <TouchableOpacity
                  key={km}
                  onPress={() => updateRadius(km)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: active
                      ? 'rgba(79,70,229,0.2)'
                      : '#1e293b',
                    borderWidth: 1,
                    borderColor: active
                      ? 'rgba(79,70,229,0.5)'
                      : 'rgba(148,163,184,0.1)',
                  }}
                >
                  <Text
                    style={{
                      color: active ? '#818cf8' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: '500',
                    }}
                  >
                    {km} km
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          onPress={handleClearCache}
          disabled={clearing}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: 'rgba(148,163,184,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(148,163,184,0.15)',
          }}
        >
          {clearing ? (
            <ActivityIndicator color="#94a3b8" />
          ) : (
            <Text
              style={{ color: '#94a3b8', fontSize: 13, fontWeight: '500' }}
            >
              Clear Offline Cache
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: 'rgba(244,63,94,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(244,63,94,0.2)',
          }}
        >
          <Text style={{ color: '#f43f5e', fontSize: 13, fontWeight: '500' }}>
            Sign Out
          </Text>
        </TouchableOpacity>

        <View>
          <Text
            style={{
              color: '#475569',
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 1,
              marginBottom: 10,
            }}
          >
            YOUR REGION (MANUAL OVERRIDE)
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 16 }}
          >
            {PH_REGIONS.map((r) => {
              const active = region === r;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setUserRegion(r)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: active
                      ? 'rgba(79,70,229,0.2)'
                      : '#1e293b',
                    borderWidth: 1,
                    borderColor: active
                      ? 'rgba(79,70,229,0.5)'
                      : 'rgba(148,163,184,0.1)',
                  }}
                >
                  <Text
                    style={{
                      color: active ? '#818cf8' : '#94a3b8',
                      fontSize: 12,
                      fontWeight: '500',
                    }}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setUserRegion(UNCLASSIFIED_REGION)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor:
                  region === UNCLASSIFIED_REGION
                    ? 'rgba(148,163,184,0.15)'
                    : '#1e293b',
                borderWidth: 1,
                borderColor:
                  region === UNCLASSIFIED_REGION
                    ? 'rgba(148,163,184,0.4)'
                    : 'rgba(148,163,184,0.1)',
              }}
            >
              <Text
                style={{
                  color:
                    region === UNCLASSIFIED_REGION ? '#cbd5e1' : '#94a3b8',
                  fontSize: 12,
                  fontWeight: '500',
                }}
              >
                {UNCLASSIFIED_REGION}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}