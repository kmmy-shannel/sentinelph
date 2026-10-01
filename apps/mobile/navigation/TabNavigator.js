// apps/mobile/navigation/TabNavigator.js
//
// Custom bottom tab bar (not the default RN Navigation tab bar UI — we
// render our own via tabBar prop) so the central "Report" button can float
// above the bar exactly as in the Figma Make prototype, and tapping it
// pushes the ReportScreen modally instead of switching tabs.
//
// UI: colors come from useTheme() so the whole bar (background, border,
// active tint, inactive tint, floating Report button) responds to the
// global dark/light toggle. All icons are SVG — no emoji, no text glyphs.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import AlertsScreen from '../screens/AlertsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyReportsScreen from '../screens/MyReportsScreen';
import ReportScreen from '../screens/ReportScreen';
import { useTheme, spacing as S } from '../theme/ThemeContext';

const Tab = createBottomTabNavigator();

// ─── Icons ────────────────────────────────────────────────────────────
// All icons share the same 1.3–1.4 stroke weight as the rest of the app.

function ReportIcon({ size = 18, color = '#ffffff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.25} stroke={color} strokeWidth={1.3} />
      <Path d="M8 4.5v4" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={8} cy={10.5} r={0.75} fill={color} />
    </Svg>
  );
}

function HomeNavIcon({ active, theme }) {
  const color = active ? theme.primarySoft : theme.textFaint;
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 8l7-6 7 6v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill={active ? theme.primaryTint : 'none'}
      />
      <Rect x={7.5} y={12} width={5} height={5} rx={0.5} stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

function SearchNavIcon({ active, theme }) {
  const color = active ? theme.primarySoft : theme.textFaint;
  return (
    <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.25} stroke={color} strokeWidth={1.3} />
      <Path d="M9.75 9.75L13.5 13.5" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function BellNavIcon({ active, theme }) {
  const color = active ? theme.primarySoft : theme.textFaint;
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2a6 6 0 016 6v3l1.5 2.5H2.5L4 11V8a6 6 0 016-6z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill={active ? theme.primaryTint : 'none'}
      />
      <Path d="M8 16.5a2 2 0 004 0" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

function ProfileNavIcon({ active, theme }) {
  const color = active ? theme.primarySoft : theme.textFaint;
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle
        cx={10}
        cy={7}
        r={3.5}
        stroke={color}
        strokeWidth={1.4}
        fill={active ? theme.primaryTint : 'none'}
      />
      <Path
        d="M3 18c0-3.314 3.134-6 7-6s7 2.686 7 6"
        stroke={color}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Theme icons (used by the Profile screen's Appearance toggle, but
// exported here too so any future "quick theme" button can reuse them).
export function MoonIcon({ size = 18, color = '#e2e8f0' }) {
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

export function SunIcon({ size = 18, color = '#e2e8f0' }) {
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

// ─── Custom tab bar ───────────────────────────────────────────────────
/**
 * Custom tab bar. Renders the 5 route icons + the floating central Report
 * button. The Report "tab" is not a real screen in the tab stack — pressing
 * it instead navigates to the ReportScreen route pushed above the tabs.
 */
const VISIBLE_TABS = ['Home', 'Search', 'Alerts', 'Profile'];

function CustomTabBar({ state, descriptors, navigation }) {
  const { theme } = useTheme();

  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.includes(r.name));
  const alertsRoute = state.routes.find((r) => r.name === 'Alerts');
  const alertCount = descriptors[alertsRoute?.key]?.options?.tabBarBadge ?? 0;

  const iconFor = (routeName, active) => {
    switch (routeName) {
      case 'Home':
        return <HomeNavIcon active={active} theme={theme} />;
      case 'Search':
        return <SearchNavIcon active={active} theme={theme} />;
      case 'Alerts':
        return <BellNavIcon active={active} theme={theme} />;
      case 'Profile':
        return <ProfileNavIcon active={active} theme={theme} />;
      default:
        return null;
    }
  };

  const labelFor = (routeName) => routeName;

  // Split visible routes around the midpoint so the Report button sits dead center.
  const leftRoutes = visibleRoutes.slice(0, 2);
  const rightRoutes = visibleRoutes.slice(2);

  const renderTab = (route) => {
    const routeIndex = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === routeIndex;
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    const tint = isFocused ? theme.primarySoft : theme.textFaint;
    const labelTint = isFocused ? theme.primarySoft : theme.textMuted;

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        activeOpacity={0.7}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          height: 56,
        }}
      >
        <View style={{ position: 'relative' }}>
          {iconFor(route.name, isFocused)}
          {route.name === 'Alerts' && alertCount > 0 && (
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 14,
                height: 14,
                paddingHorizontal: 3,
                borderRadius: 7,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.rose,
              }}
            >
              <Text style={{ fontSize: 8, color: '#ffffff', fontWeight: '700' }}>
                {alertCount}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 9,
            fontWeight: '600',
            letterSpacing: 0.2,
            color: labelTint,
          }}
        >
          {labelFor(route.name)}
        </Text>
        {/* Active indicator pill */}
        <View
          style={{
            width: isFocused ? 16 : 0,
            height: 2,
            borderRadius: 1,
            backgroundColor: theme.primarySoft,
            marginTop: 2,
            opacity: isFocused ? 1 : 0,
          }}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: S.sm,
        paddingBottom: S.xs,
        paddingTop: S.xs,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        backgroundColor: theme.bg,
        height: 68,
      }}
    >
      {leftRoutes.map((route) => renderTab(route))}

      <TouchableOpacity
        onPress={() => navigation.navigate('ReportWizard')}
        activeOpacity={0.85}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          height: 56,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.primary,
            borderWidth: 2,
            borderColor: theme.primaryTintBorder,
            marginTop: -16,
            shadowColor: theme.primary,
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}
        >
          <ReportIcon size={18} color="#ffffff" />
        </View>
        <Text
          style={{
            fontSize: 9,
            fontWeight: '600',
            letterSpacing: 0.2,
            color: theme.textFaint,
            marginTop: 2,
          }}
        >
          Report
        </Text>
      </TouchableOpacity>

      {rightRoutes.map((route) => renderTab(route))}
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
      {/* Hidden routes reachable via navigation.navigate, not shown as tabs */}
      <Tab.Screen
        name="ReportWizard"
        component={ReportScreen}
        options={{ tabBarButton: () => null }}
      />
      <Tab.Screen
        name="MyReports"
        component={MyReportsScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}