// apps/mobile/components/QuickReportCard.js
//
// Pinned home widget: "Report in Under 1 Minute" CTA with quick shortcuts
// into the camera/mic-first entry points of the report wizard.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

function ShieldIcon({ size = 16, color = 'currentColor' }) {
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

function ReportIcon({ size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.25} stroke="white" strokeWidth={1.3} />
      <Path d="M8 4.5v4" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={8} cy={10.5} r={0.75} fill="white" />
    </Svg>
  );
}

function CameraIcon({ size = 16, color = 'currentColor' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M1.5 4.5h13a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 010 13V6a1.5 1.5 0 011.5-1.5z"
        stroke={color}
        strokeWidth={1.2}
      />
      <Circle cx={8} cy={9} r={2.25} stroke={color} strokeWidth={1.2} />
      <Path d="M5.5 4.5l1-2h3l1 2" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}



/**
 * @param {() => void} onQuickReport - navigate to ReportScreen step 1
 * @param {() => void} onCameraShortcut - navigate to ReportScreen with camera pre-opened

 */
export default function QuickReportCard({ onQuickReport, onCameraShortcut }) {
  return (
    <View
      className="rounded-2xl p-4"
      style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(79,70,229,0.3)' }}
    >
      <View className="flex-row items-start justify-between mb-3">
        <View>
          <Text style={{ color: '#e2e8f0', fontSize: 14, fontWeight: '600', letterSpacing: -0.2 }}>
            Report in Under 1 Minute
          </Text>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
            Anonymous · Zero-knowledge protected
          </Text>
        </View>
        <View
          className="w-8 h-8 rounded-xl items-center justify-center"
          style={{ backgroundColor: 'rgba(79,70,229,0.2)', borderWidth: 1, borderColor: 'rgba(79,70,229,0.3)' }}
        >
          <ShieldIcon size={16} color="#818cf8" />
        </View>
      </View>

      <View className="flex-row gap-2">
        <TouchableOpacity
          onPress={onQuickReport}
          activeOpacity={0.85}
          className="flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl"
          style={{ backgroundColor: '#4f46e5' }}
        >
          <ReportIcon size={14} />
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Quick Report</Text>
        </TouchableOpacity>

                <TouchableOpacity
          onPress={onCameraShortcut}
          activeOpacity={0.85}
          className="w-14 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: 'rgba(148,163,184,0.1)', borderWidth: 1, borderColor: 'rgba(148,163,184,0.15)' }}
        >
          <CameraIcon size={16} color="#94a3b8" />
        </TouchableOpacity>

       
      </View>
    </View>
  );
}