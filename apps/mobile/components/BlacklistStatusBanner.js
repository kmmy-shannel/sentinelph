// apps/mobile/components/BlacklistStatusBanner.js
//
// Top-of-home threat banner. Mirrors THREAT_CONFIG in the Figma Make
// App.tsx prototype 1:1 — same copy, same accent colors, same pill labels.
// Uses expo-linear-gradient since NativeWind/RN has no CSS `background:
// linear-gradient(...)` equivalent.

import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export const THREAT_CONFIG = {
  safe: {
    label: 'THREAT LEVEL: LOW',
    sub: 'No active scam surge in your area',
    gradient: ['#064e3b', '#065f46'],
    accent: '#10b981',
    pill: 'Area Clear',
    pillBg: 'rgba(16,185,129,0.2)',
    icon: '✓',
  },
  moderate: {
    label: 'THREAT LEVEL: MODERATE',
    sub: '3 new reports within 2 km — stay alert',
    gradient: ['#451a03', '#78350f'],
    accent: '#f59e0b',
    pill: 'Stay Alert',
    pillBg: 'rgba(245,158,11,0.2)',
    icon: '⚠',
  },
  high: {
    label: 'THREAT LEVEL: HIGH',
    sub: 'Active scam surge detected nearby',
    gradient: ['#4c0519', '#881337'],
    accent: '#f43f5e',
    pill: 'High Alert',
    pillBg: 'rgba(244,63,94,0.2)',
    icon: '!',
  },
};

/**
 * @param {'safe' | 'moderate' | 'high'} level
 */
export default function BlacklistStatusBanner({ level = 'moderate' }) {
  const cfg = THREAT_CONFIG[level] || THREAT_CONFIG.moderate;

  return (
    <LinearGradient
      colors={cfg.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}
    >
      <View className="flex-row items-center justify-between mb-1">
        <View className="flex-row items-center gap-2">
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            style={{ backgroundColor: cfg.accent }}
          >
            <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: '700' }}>{cfg.icon}</Text>
          </View>
          <Text
            style={{ color: cfg.accent, fontSize: 11, fontWeight: '600', letterSpacing: 1.2 }}
            className="uppercase"
          >
            {cfg.label}
          </Text>
        </View>
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: cfg.pillBg, borderWidth: 1, borderColor: `${cfg.accent}30` }}
        >
          <Text style={{ color: cfg.accent, fontSize: 11, fontWeight: '600' }}>{cfg.pill}</Text>
        </View>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{cfg.sub}</Text>
    </LinearGradient>
  );
}