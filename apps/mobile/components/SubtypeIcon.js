// apps/mobile/components/SubtypeIcon.js
//
// Inline SVG icon set for AI subtype guidance. Rendered instead of
// emojis so the icons look consistent across iOS, Android, and Web,
// scale cleanly at any size, and can be themed to match the current
// risk tier's accent color.
//
// Usage:
//   <SubtypeIcon subtype="phishing_link" size={20} color="#f43f5e" />

import React from 'react';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

function MessageIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 4h14v10H8l-4 3v-3H3V4z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function LockIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={4} y={9} width={12} height={8} rx={1.5} stroke={color} strokeWidth={1.4} />
      <Path d="M7 9V6a3 3 0 016 0v3" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={10} cy={13} r={1} fill={color} />
    </Svg>
  );
}

function CalendarIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={5} width={14} height={12} rx={1.5} stroke={color} strokeWidth={1.4} />
      <Line x1={3} y1={8} x2={17} y2={8} stroke={color} strokeWidth={1.4} />
      <Line x1={7} y1={3} x2={7} y2={6} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={13} y1={3} x2={13} y2={6} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function ParcelIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2l7 4v8l-7 4-7-4V6l7-4z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path d="M3 6l7 4 7-4" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Line x1={10} y1={10} x2={10} y2={18} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

function BankIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M2 8l8-5 8 5" stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
      <Line x1={2} y1={8} x2={18} y2={8} stroke={color} strokeWidth={1.4} />
      <Line x1={4} y1={8} x2={4} y2={16} stroke={color} strokeWidth={1.4} />
      <Line x1={8} y1={8} x2={8} y2={16} stroke={color} strokeWidth={1.4} />
      <Line x1={12} y1={8} x2={12} y2={16} stroke={color} strokeWidth={1.4} />
      <Line x1={16} y1={8} x2={16} y2={16} stroke={color} strokeWidth={1.4} />
      <Line x1={2} y1={16} x2={18} y2={16} stroke={color} strokeWidth={1.4} />
    </Svg>
  );
}

function MegaphoneIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 8v4l10 4V4L3 8z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Path d="M13 8a3 3 0 010 4" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={5} y1={12} x2={5} y2={16} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function AlertIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 3L18 17H2L10 3z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <Line x1={10} y1={8} x2={10} y2={12} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Circle cx={10} cy={14.5} r={0.7} fill={color} />
    </Svg>
  );
}

function CrossIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.5} stroke={color} strokeWidth={1.4} />
      <Line x1={7} y1={7} x2={13} y2={13} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={13} y1={7} x2={7} y2={13} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function QuestionIcon({ size, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7.5} stroke={color} strokeWidth={1.4} />
      <Path
        d="M8 8.5a2 2 0 013.5-1.5c.5.5.5 1 0 1.5L10 10v1"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={10} cy={14} r={0.7} fill={color} />
    </Svg>
  );
}

const ICONS = {
  personal_conversational: MessageIcon,
  two_factor_auth: LockIcon,
  appointment_reminder: CalendarIcon,
  delivery_tracking: ParcelIcon,
  bank_activity_alert: BankIcon,
  brand_marketing: MegaphoneIcon,
  phishing_link: AlertIcon,
  fake_prize_lottery: CrossIcon,
  UNLABELED: QuestionIcon,
  DEFAULT: AlertIcon,
};

export default function SubtypeIcon({ subtype, size = 20, color = '#818cf8' }) {
  const Icon = ICONS[subtype] || ICONS.DEFAULT;
  return <Icon size={size} color={color} />;
}