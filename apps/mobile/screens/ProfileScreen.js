// apps/mobile/screens/ProfileScreen.js
//
// Anonymous profile: name/email if the citizen signed in with them,
// report counts, ZKP-safe wallet preview, and sign-out.
//
// Removed (per requirement): Reputation Score, ZKP Wallet, Offline
// Storage count, Alert Radius selector, and Your Region (Manual Override).
// The "Your Region" row is kept because it reflects the region stored by
// the report flow's region resolver.
//
// UI: colors come from useTheme() so the screen responds to the global
// dark/light toggle. Also hosts the Appearance section — the single
// place users can flip the theme.
//
// Icons: all SVG — no emoji, no text glyphs. Row.icon accepts either a
// string (legacy) or a React node (preferred).

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
import Svg, { Circle, Path, Line, Rect } from 'react-native-svg';
import { auth } from '../config/firebase';

import { getAllReports, clearAllReports } from '../db/sqlite';
import { getOrCreateDeviceSecret } from '../lib/zkp/nullifierGenerator';
import { UNCLASSIFIED_REGION } from '../lib/regionResolver';
import { useTheme, spacing as S } from '../theme/ThemeContext';

// ─── Icons (all SVG, matching stroke language) ────────────────────────

function FileIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5L9 1.5z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Path d="M9 1.5V5.5H13" stroke={color} strokeWidth={1.3} strokeLinejoin="round" />
    </Svg>
  );
}

function PinIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 14.5s5-4.5 5-8.5a5 5 0 10-10 0c0 4 5 8.5 5 8.5z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Circle cx={8} cy={6} r={1.75} stroke={color} strokeWidth={1.3} />
    </Svg>
  );
}

function LockIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect
        x={3}
        y={7}
        width={10}
        height={7}
        rx={1.5}
        stroke={color}
        strokeWidth={1.3}
      />
      <Path
        d="M5.25 7V5a2.75 2.75 0 115.5 0v2"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronRightIcon({ size = 14, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path
        d="M4.5 2.5L8 6l-3.5 3.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MoonIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M16.5 11.5A7 7 0 018.5 3.5a7 7 0 107.999 8z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function SunIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={3.5} stroke={color} strokeWidth={1.4} />
      <Line x1={10} y1={1.5} x2={10} y2={3} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={10} y1={17} x2={10} y2={18.5} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={1.5} y1={10} x2={3} y2={10} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={17} y1={10} x2={18.5} y2={10} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={4} y1={4} x2={5.1} y2={5.1} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={14.9} y1={14.9} x2={16} y2={16} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={4} y1={16} x2={5.1} y2={14.9} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={14.9} y1={5.1} x2={16} y2={4} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function ProfileIcon({ size = 34, color = '#e0e7ff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={12}
        cy={9}
        r={3.5}
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
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

// ─── UI primitives ────────────────────────────────────────────────────

function Badge({ label, color, theme }) {
  const palette = {
    indigo: {
      text: theme.primarySoft,
      bg: theme.primaryTint,
      border: theme.primaryTintBorder,
    },
    emerald: {
      text: theme.emerald,
      bg: 'rgba(16,185,129,0.12)',
      border: 'rgba(16,185,129,0.25)',
    },
  };
  const s = palette[color] || palette.indigo;
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
      }}
    >
      <Text style={{ color: s.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>
        {label}
      </Text>
    </View>
  );
}

// Row.icon accepts EITHER a string (rendered as <Text>) OR a React node
// (rendered as-is inside the tinted square). Everything else in the row
// is identical to the original.
function Row({ icon, label, value, mono, theme, onPress, right }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: S.md,
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderRadius: 14,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.primaryFaint,
          flexShrink: 0,
        }}
      >
        {typeof icon === 'string' ? (
          <Text style={{ color: theme.primarySoft, fontSize: 14 }}>{icon}</Text>
        ) : (
          icon
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            color: theme.text,
            fontSize: 13,
            fontWeight: '600',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {value ? (
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 11,
              marginTop: 2,
              fontFamily: mono ? 'JetBrainsMono_400Regular' : undefined,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {right ? right : null}
    </Wrapper>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

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

// ─── Screen ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { theme, mode, toggleTheme } = useTheme();
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: S.lg,
          paddingTop: S.lg,
          paddingBottom: 32,
          maxWidth: isWide ? 720 : undefined,
          alignSelf: isWide ? 'center' : 'stretch',
          width: '100%',
          gap: S.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + name + email */}
        <View style={{ alignItems: 'center', paddingVertical: 20, gap: 6 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.primary,
              borderWidth: 2,
              borderColor: theme.primaryTintBorder,
              marginBottom: 8,
            }}
          >
            <ProfileIcon size={38} color="#e0e7ff" />
          </View>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>
            {displayName}
          </Text>
          {userEmail ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{userEmail}</Text>
          ) : (
            <Text style={{ color: theme.textFaint, fontSize: 12 }}>
              Anonymous · Verified contributor
            </Text>
          )}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: S.sm,
              marginTop: 8,
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <Badge theme={theme} label="Citizen Reporter" color="indigo" />
            <Badge
              theme={theme}
              label={`${profile.confirmedCount} confirmed`}
              color="emerald"
            />
          </View>
        </View>

        {/* Account section */}
        <View style={{ gap: S.sm }}>
          <Text
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              paddingHorizontal: 2,
            }}
          >
            ACCOUNT
          </Text>
          <Row
            theme={theme}
            icon={<FileIcon size={16} color={theme.primarySoft} />}
            label="My Reports"
            value={`${profile.totalReports} total · ${queuedCount} queued offline`}
            onPress={() => navigation.navigate('MyReports')}
            right={<ChevronRightIcon size={14} color={theme.primarySoft} />}
          />
          <Row
            theme={theme}
            icon={<PinIcon size={16} color={theme.primarySoft} />}
            label="Your Region"
            value={region}
          />
          <Row
            theme={theme}
            icon={<LockIcon size={16} color={theme.primarySoft} />}
            label="Data Sharing"
            value="Anonymous only"
          />
        </View>

        {/* Appearance section — hosts the global Dark/Light toggle */}
        <View style={{ gap: S.sm }}>
          <Text
            style={{
              color: theme.textDim,
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 1.2,
              paddingHorizontal: 2,
            }}
          >
            APPEARANCE
          </Text>
          <Row
            theme={theme}
            icon={
              mode === 'dark' ? (
                <MoonIcon size={16} color={theme.primarySoft} />
              ) : (
                <SunIcon size={16} color={theme.primarySoft} />
              )
            }
            label={mode === 'dark' ? 'Dark Mode' : 'Light Mode'}
            value="Tap to switch themes"
            onPress={toggleTheme}
            right={
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: theme.primaryTint,
                  borderWidth: 1,
                  borderColor: theme.primaryTintBorder,
                }}
              >
                <Text style={{ color: theme.primarySoft, fontSize: 11, fontWeight: '700' }}>
                  {mode === 'dark' ? 'Dark' : 'Light'}
                </Text>
              </View>
            }
          />
        </View>

        {/* Clear cache */}
        <TouchableOpacity
          onPress={handleClearCache}
          disabled={clearing}
          style={{
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {clearing ? (
            <ActivityIndicator color={theme.textDim} />
          ) : (
            <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: '600' }}>
              Clear Offline Cache
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
            backgroundColor: theme.roseTint,
            borderWidth: 1,
            borderColor: theme.roseTintBorder,
          }}
        >
          <Text style={{ color: theme.rose, fontSize: 13, fontWeight: '700' }}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}