// apps/mobile/components/QuickReportCard.js
//
// Pinned home widget: "Report in Under 1 Minute" CTA with quick shortcuts
// into the camera-first entry point of the report wizard.
//
// UI: colors come from useTheme() so the card flips between dark and
// light with the rest of the app. No behavior change.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme, spacing as S } from '../theme/ThemeContext';

function ShieldIcon({ size = 16, color = '#818cf8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M8 1.5L2.5 4v4c0 3.1 2.25 5.45 5.5 6 3.25-.55 5.5-2.9 5.5-6V4L8 1.5z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 8l1.75 1.75L10.5 6"
        stroke={color}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ReportIcon({ size = 16, color = '#ffffff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.25} stroke={color} strokeWidth={1.3} />
      <Path d="M8 4.5v4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={8} cy={10.5} r={0.75} fill={color} />
    </Svg>
  );
}

function CameraIcon({ size = 16, color = '#94a3b8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M2 5h12a1 1 0 011 1v7a1 1 0 01-1 1H2a1 1 0 01-1-1V6a1 1 0 011-1z"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
      <Circle cx={8} cy={9.5} r={2.25} stroke={color} strokeWidth={1.3} />
      <Path
        d="M6 5l0.8-1.5h2.4L10 5"
        stroke={color}
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * @param {() => void} onQuickReport     - navigate to ReportScreen step 1
 * @param {() => void} onCameraShortcut  - navigate to ReportScreen with camera pre-opened
 */
export default function QuickReportCard({ onQuickReport, onCameraShortcut }) {
  const { theme } = useTheme();

  return (
    <View
      style={{
        borderRadius: 18,
        padding: 16,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.primaryTintBorder,
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: S.md,
          gap: S.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: theme.text,
              fontSize: 15,
              fontWeight: '700',
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            Report in Under 1 Minute
          </Text>
          <Text
            style={{
              color: theme.textMuted,
              fontSize: 12,
              marginTop: 3,
            }}
            numberOfLines={1}
          >
            Anonymous · Zero-knowledge protected
          </Text>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.primaryTint,
            borderWidth: 1,
            borderColor: theme.primaryTintBorder,
            flexShrink: 0,
          }}
        >
          <ShieldIcon size={16} color={theme.primarySoft} />
        </View>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'stretch' }}>
        <TouchableOpacity
          onPress={onQuickReport}
          activeOpacity={0.85}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: S.sm,
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          <ReportIcon size={14} color="#ffffff" />
          <Text
            style={{
              color: '#ffffff',
              fontSize: 13,
              fontWeight: '700',
              letterSpacing: 0.2,
            }}
            numberOfLines={1}
          >
            Quick Report
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onCameraShortcut}
          activeOpacity={0.85}
          style={{
            width: 48,
            minHeight: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.surfaceAlt,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <CameraIcon size={16} color={theme.textDim} />
        </TouchableOpacity>
      </View>
    </View>
  );
}