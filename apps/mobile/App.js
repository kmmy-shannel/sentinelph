import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import TabNavigator from './navigation/TabNavigator';
import { initDB } from './db/sqlite';

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        await initDB();
        setDbReady(true);
      } catch (error) {
        console.error('Failed to initialize local database:', error);
        setDbError(error.message);
        setDbReady(true);
      }
    })();
  }, []);

  if (!dbReady) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#1E3A8A" />
        <Text className="mt-4 text-slate-500">Starting SentinelPH...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <TabNavigator />
      </NavigationContainer>
      {dbError ? (
        <View className="absolute bottom-0 left-0 right-0 bg-red-600 px-4 py-2">
          <Text className="text-white text-xs text-center">
            Local storage failed to initialize: {dbError}
          </Text>
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}