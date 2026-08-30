// apps/mobile/navigation/TabNavigator.js
//
// Custom bottom tab bar (not the default RN Navigation tab bar UI — we
// render our own via tabBar prop) so the central "Report" button can float
// above the bar exactly as in the Figma Make prototype, and tapping it
// pushes the ReportScreen modally instead of switching tabs.

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import AlertsScreen from '../screens/AlertsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MyReportsScreen from '../screens/MyReportsScreen';
import ReportScreen from '../screens/ReportScreen';

const Tab = createBottomTabNavigator();

function ReportIcon({ size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.25} stroke="white" strokeWidth={1.3} />
      <Path d="M8 4.5v4" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx={8} cy={10.5} r={0.75} fill="white" />
    </Svg>
  );
}

function HomeNavIcon({ active }) {
  const color = active ? '#818cf8' : '#475569';
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M3 8l7-6 7 6v9a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill={active ? 'rgba(129,140,248,0.15)' : 'none'}
      />
      <Rect x={7.5} y={12} width={5} height={5} rx={0.5} stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

function SearchNavIcon({ active }) {
  const color = active ? '#818cf8' : '#475569';
  return (
    <Svg width={20} height={20} viewBox="0 0 16 16" fill="none">
      <Circle cx={6.5} cy={6.5} r={4.25} stroke={color} strokeWidth={1.3} />
      <Path d="M9.75 9.75L13.5 13.5" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function BellNavIcon({ active }) {
  const color = active ? '#818cf8' : '#475569';
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M10 2a6 6 0 016 6v3l1.5 2.5H2.5L4 11V8a6 6 0 016-6z"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill={active ? 'rgba(129,140,248,0.15)' : 'none'}
      />
      <Path d="M8 16.5a2 2 0 004 0" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

function ProfileNavIcon({ active }) {
  const color = active ? '#818cf8' : '#475569';
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={7} r={3.5} stroke={color} strokeWidth={1.4} fill={active ? 'rgba(129,140,248,0.15)' : 'none'} />
      <Path d="M3 18c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Custom tab bar. Renders the 5 route icons + the floating central Report
 * button. The Report "tab" is not a real screen in the tab stack — pressing
 * it instead navigates to the ReportScreen route pushed above the tabs.
 */
const VISIBLE_TABS = ['Home', 'Search', 'Alerts', 'Profile'];

function CustomTabBar({ state, descriptors, navigation }) {
  const visibleRoutes = state.routes.filter((r) => VISIBLE_TABS.includes(r.name));
  const alertsRoute = state.routes.find((r) => r.name === 'Alerts');
  const alertCount = descriptors[alertsRoute?.key]?.options?.tabBarBadge ?? 0;

  const iconFor = (routeName, active) => {
    switch (routeName) {
      case 'Home':
        return <HomeNavIcon active={active} />;
      case 'Search':
        return <SearchNavIcon active={active} />;
      case 'Alerts':
        return <BellNavIcon active={active} />;
      case 'Profile':
        return <ProfileNavIcon active={active} />;
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
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TouchableOpacity
        key={route.key}
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-1 items-center justify-center gap-0.5"
        style={{ height: 56 }}
      >
        <View className="relative">
          {iconFor(route.name, isFocused)}
          {route.name === 'Alerts' && alertCount > 0 && (
            <View
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full items-center justify-center"
              style={{ backgroundColor: '#f43f5e' }}
            >
              <Text style={{ fontSize: 8, color: 'white', fontWeight: '700' }}>{alertCount}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontSize: 9, fontWeight: '500', color: isFocused ? '#818cf8' : '#334155' }}>
          {labelFor(route.name)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View
      className="flex-row items-center px-2 pb-1 pt-1"
      style={{
        borderTopWidth: 1,
        borderTopColor: 'rgba(148,163,184,0.1)',
        backgroundColor: 'rgba(10,17,32,0.98)',
        height: 68,
      }}
    >
      {leftRoutes.map((route) => renderTab(route))}

      <TouchableOpacity
        onPress={() => navigation.navigate('ReportWizard')}
        activeOpacity={0.85}
        className="flex-1 items-center justify-center"
        style={{ height: 56 }}
      >
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center"
          style={{
            backgroundColor: '#4f46e5',
            borderWidth: 2,
            borderColor: 'rgba(129,140,248,0.4)',
            marginTop: -16,
            shadowColor: '#4f46e5',
            shadowOpacity: 0.4,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          }}
        >
          <ReportIcon size={18} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '500', color: '#475569', marginTop: 2 }}>Report</Text>
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