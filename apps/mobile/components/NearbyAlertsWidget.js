// apps/mobile/components/NearbyAlertsWidget.js
import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import Svg, { Line, Rect, Circle } from 'react-native-svg';

const HEAT_COLOR = {
  high: '#f43f5e',
  moderate: '#f59e0b',
  low: '#10b981',
};

const HEAT_DOT_BG = {
  high: 'rgba(244,63,94,0.25)',
  moderate: 'rgba(245,158,11,0.2)',
  low: 'rgba(16,185,129,0.15)',
};

function timeAgo(dateStr) {
  if (!dateStr) return 'just now';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function MiniMap({ incidents, radiusLabel = 'Your area · 2km radius' }) {
  return (
    <View className="relative rounded-xl overflow-hidden" style={{ height: 148, backgroundColor: '#0c1929' }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        {[20, 35, 50, 65, 80].map((v) => (
          <React.Fragment key={v}>
            <Line x1={v} y1="0" x2={v} y2="100" stroke="rgba(148,163,184,0.08)" strokeWidth={0.5} />
            <Line x1="0" y1={v} x2="100" y2={v} stroke="rgba(148,163,184,0.08)" strokeWidth={0.5} />
          </React.Fragment>
        ))}

        <Line x1="0" y1="50" x2="100" y2="50" stroke="rgba(148,163,184,0.18)" strokeWidth={1.2} />
        <Line x1="50" y1="0" x2="50" y2="100" stroke="rgba(148,163,184,0.18)" strokeWidth={1.2} />
        <Line x1="0" y1="30" x2="100" y2="30" stroke="rgba(148,163,184,0.1)" strokeWidth={0.8} />
        <Line x1="30" y1="0" x2="30" y2="100" stroke="rgba(148,163,184,0.1)" strokeWidth={0.8} />
        <Line x1="70" y1="0" x2="70" y2="100" stroke="rgba(148,163,184,0.1)" strokeWidth={0.8} />

        {[
          [21, 31, 13, 18],
          [51, 69, 31, 18],
          [21, 28, 51, 18],
          [72, 77, 31, 18],
          [36, 13, 36, 13],
        ].map(([x, w, y, h], i) => (
          <Rect key={i} x={x} y={y} width={w} height={h} fill="rgba(79,70,229,0.06)" rx={0.5} />
        ))}

        {incidents.map((inc) => (
          <React.Fragment key={inc.id}>
            <Circle cx={inc.x ?? 50} cy={inc.y ?? 50} r={3.5} fill={HEAT_DOT_BG[inc.heat] || HEAT_DOT_BG.low} />
            <Circle cx={inc.x ?? 50} cy={inc.y ?? 50} r={1.8} fill={HEAT_COLOR[inc.heat] || HEAT_COLOR.low} />
          </React.Fragment>
        ))}

        <Circle cx="50" cy="50" r={5} fill="rgba(79,70,229,0.25)" />
        <Circle cx="50" cy="50" r={2.5} fill="#818cf8" />
        <Circle cx="50" cy="50" r={1.2} fill="white" />
      </Svg>

      <View className="absolute bottom-2 right-2 flex-row items-center gap-2">
        <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(79,70,229,0.35)' }}>
          <Text style={{ color: '#818cf8', fontSize: 9, fontWeight: '600' }}>● YOU</Text>
        </View>
      </View>
      <View className="absolute top-2 left-2">
        <Text
          className="px-1.5 py-0.5 rounded"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#94a3b8', fontSize: 9, fontWeight: '500', overflow: 'hidden' }}
        >
          {radiusLabel}
        </Text>
      </View>
    </View>
  );
}

function IncidentRow({ inc, isFirst }) {
  return (
    <View
      className="flex-row items-center gap-3 px-4 py-2.5"
      style={{ borderTopWidth: isFirst ? 0 : 1, borderTopColor: 'rgba(148,163,184,0.06)' }}
    >
      <View
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: HEAT_COLOR[inc.heat] || HEAT_COLOR.low }}
      />
      <View className="flex-1 min-w-0">
        <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
          {inc.type || 'Scam report'}
        </Text>
        <Text style={{ color: '#475569', fontSize: 11 }} numberOfLines={1}>
          {inc.number || 'Unknown'} · {inc.region || 'PH'} · {timeAgo(inc.reportedAt)}
        </Text>
      </View>
      <Text style={{ color: '#334155', fontSize: 9, fontFamily: 'JetBrainsMono_400Regular' }}>
        {inc.reportCount || 1}×
      </Text>
    </View>
  );
}

export default function NearbyAlertsWidget({ incidents = [] }) {
  const hasData = incidents.length > 0;

  return (
    <View
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(148,163,184,0.12)' }}
    >
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <View className="flex-row items-center gap-2">
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#f43f5e' }} />
          <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }}>
            Nearby Scam Activity
          </Text>
        </View>
        <View
          className="px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.25)' }}
        >
          <Text style={{ color: '#f43f5e', fontSize: 10, fontWeight: '500' }}>
            {incidents.length} active
          </Text>
        </View>
      </View>

      {hasData ? (
        <>
          <View className="px-3 pb-3">
            <MiniMap incidents={incidents} />
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.08)' }}>
            <ScrollView style={{ maxHeight: 168 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {incidents.map((inc, i) => (
                <IncidentRow key={inc.id} inc={inc} isFirst={i === 0} />
              ))}
            </ScrollView>
          </View>
        </>
      ) : (
        <View className="px-4 pb-6 pt-2 items-center">
          <View
            className="w-12 h-12 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}
          >
            <Text style={{ fontSize: 20 }}>🛡️</Text>
          </View>
          <Text style={{ color: '#e2e8f0', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
            Your area is clear
          </Text>
          <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'center', paddingHorizontal: 24 }}>
            No active scam reports near you in the last 7 days. We'll alert you if that changes.
          </Text>
        </View>
      )}
    </View>
  );
}