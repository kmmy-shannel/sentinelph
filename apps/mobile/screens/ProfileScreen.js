// apps/mobile/screens/ProfileScreen.js
//
// Anonymous profile: name/email if the citizen signed in with them,
// report counts, ZKP-safe wallet preview, and sign-out.
//
// Removed (per requirement): Reputation Score, ZKP Wallet, Offline
// Storage count, Alert Radius selector, and Your Region (Manual Override).
// The "Your Region" row is kept because it reflects the region stored by
// the report flow's region resolver.

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
import Svg, { Circle, Path } from 'react-native-svg';
import { auth } from '../config/firebase';

import { getAllReports, clearAllReports } from '../db/sqlite';
import { getOrCreateDeviceSecret } from '../lib/zkp/nullifierGenerator';
import { UNCLASSIFIED_REGION } from '../lib/regionResolver';

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
          maxWidth: '55%',
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// Minimal line-art profile silhouette used in the avatar circle.
// Drawn with SVG so it scales cleanly and matches the UI's stroke
// language (same 1.6 stroke weight as the icons in ReportScreen).
function ProfileIcon({ size = 34, color = '#e0e7ff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Head */}
      <Circle
        cx={12}
        cy={9}
        r={3.5}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Shoulders / torso */}
      <Path
        d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Derives a human-readable display name from the Firebase user object.
// Falls back through displayName → email local-part → literal "Citizen".
function resolveDisplayName(user) {
  if (!user) return 'Citizen';
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  if (user.email && user.email.includes('@')) return user.email.split('@')[0];
  return 'Citizen';
}

function resolveEmail(user) {
  if (!user) return null;
  return user.email || null;
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const isWide = width >= 480;

  const [profile, setProfile] = useState({
    totalReports: 0,
    confirmedCount: 0,
  });
  const [queuedCount, setQueuedCount] = useState(0);
  const [region, setRegion] = useState(UNCLASSIFIED_REGION);
  const [clearing, setClearing] = useState(false);

  // Firebase user fields for the name / email rows
  const currentUser = auth.currentUser;
  const displayName = resolveDisplayName(currentUser);
  const userEmail = resolveEmail(currentUser);

  const load = useCallback(async () => {
    const all = await getAllReports();
    setQueuedCount(all.filter((r) => !r.synced).length);

    // Touch the device secret so a first-open initialises it, but we do
    // not display it anywhere on this screen anymore.
    try {
      await getOrCreateDeviceSecret();
    } catch {
      // non-fatal
    }

    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const storedRegion = await AsyncStorage.getItem('@sentinelph_user_region');
      if (storedRegion) setRegion(storedRegion);
    } catch (err) {
      console.warn('[ProfileScreen] failed to read region:', err?.message);
    }
    // Profile counts come from the local SQLite outbox — the citizen's
    // own reports are the authoritative source. The server has no
    // /profile/summary route, so we skip the wasted network call.
    setProfile((prev) => ({
      ...prev,
      totalReports: all.length,
      confirmedCount: all.filter((r) => r.synced).length,
    }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        {/* Avatar + name + email */}
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
            <ProfileIcon size={34} color="#e0e7ff" />
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 16, fontWeight: '600' }}>
            {displayName}
          </Text>
          {userEmail ? (
            <Text style={{ color: '#64748b', fontSize: 11 }}>{userEmail}</Text>
          ) : (
            <Text style={{ color: '#475569', fontSize: 11 }}>
              Anonymous · Verified contributor
            </Text>
          )}
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
            <Badge label="Citizen Reporter" color="indigo" />
            <Badge
              label={`${profile.confirmedCount} confirmed`}
              color="emerald"
            />
          </View>
        </View>

        {/* Identity + status rows */}
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
            icon="◎"
            label="Your Region"
            value={region}
          />
          <Row
            icon="◉"
            label="Data Sharing"
            value="Anonymous only"
          />
        </View>

        {/* Clear cache */}
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

        {/* Sign out */}
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
      </ScrollView>
    </SafeAreaView>
  );
}