// apps/mobile/App.js
import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar as RNStatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

import { AuthProvider, useAuth } from './context/AuthContext';
import AuthScreen from './screens/AuthScreen';
import TabNavigator from './navigation/TabNavigator';
import { initDB, pruneBlacklistCache } from './db/sqlite';
import * as syncQueue from './db/syncQueue';

// --- ENV DIAGNOSTIC CHECK ---
console.log('================ [ENV CHECK START] ================');
console.log('API Gateway URL   :', process.env.EXPO_PUBLIC_API_URL);
console.log('API Timeout (ms)  :', process.env.EXPO_PUBLIC_API_TIMEOUT_MS);
console.log('Firebase Proj ID  :', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
console.log('SQLite DB Name    :', process.env.EXPO_PUBLIC_SQLITE_DB_NAME);
console.log('Max Sync Attempts :', process.env.EXPO_PUBLIC_SQLITE_MAX_SYNC_ATTEMPTS);
console.log('ZKP Separator     :', process.env.EXPO_PUBLIC_ZKP_DOMAIN_SEPARATOR);
console.log('================ [ENV CHECK END] ==================');

SplashScreen.preventAutoHideAsync().catch(() => {
  // Safe to ignore if already hidden
});

/**
 * Reads auth state and renders the correct navigation tree.
 *
 * FIX: previously gated purely on `isAuthenticated`, which Firebase flips
 * to true the instant createUserWithEmailAndPassword() resolves — well
 * before the user has verified their email, and even before
 * sendEmailVerification() finishes sending. That caused brand-new,
 * unverified accounts to land straight on the Dashboard.
 *
 * The Dashboard now requires BOTH isAuthenticated AND isEmailVerified.
 * An authenticated-but-unverified user renders <AuthScreen/>, which
 * itself is already routed to the 'verify' view by AuthContext's
 * onAuthStateChanged handler — so this component doesn't need to know
 * anything about *which* view AuthScreen shows, only whether the
 * Dashboard is allowed.
 */
function RootNavigator() {
  const { isAuthenticated, isEmailVerified, initializing } = useAuth();

  if (initializing) {
    return null;
  }

  const canAccessDashboard = isAuthenticated && isEmailVerified;

  return (
    <NavigationContainer>
      {canAccessDashboard ? <TabNavigator /> : <AuthScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const [dbReady, setDbReady] = useState(false);

   useEffect(() => {
    async function prepareApp() {
      try {
        await initDB();
        // Age out cached blacklist lookups older than 30 days so the
        // table doesn't grow forever. Best-effort: failures are logged
        // inside pruneBlacklistCache() and never block startup.
        await pruneBlacklistCache();
      } catch (err) {
        console.warn('[App] SQLite init failed:', err?.message || err);
      } finally {
        setDbReady(true);
      }

      // Safe binding for sync listener regardless of function name
      if (typeof syncQueue.initSyncListener === 'function') {
        syncQueue.initSyncListener();
      } else if (typeof syncQueue.startSyncListener === 'function') {
        syncQueue.startSyncListener();
      }
    }

    prepareApp();

    return () => {
      if (typeof syncQueue.stopSyncListener === 'function') {
        syncQueue.stopSyncListener();
      }
    };
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded && dbReady) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, dbReady]);

  if (!fontsLoaded || !dbReady) {
    return null;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView} style={{ flex: 1 }}>
      <RNStatusBar barStyle="light-content" backgroundColor="#0a1120" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}