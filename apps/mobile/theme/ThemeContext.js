// apps/mobile/theme/ThemeContext.js
//
// Global theme provider. Pure UI layer — holds the active color palette
// (dark or light) and a toggle. Persisted to AsyncStorage under a
// dedicated key so it never collides with other app state.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@sentinelph_theme';

// ── Palettes ──────────────────────────────────────────────────────────
export const darkTheme = {
  mode: 'dark',
  bg: '#0a1120',
  surface: '#111a2e',
  surfaceAlt: 'rgba(30,41,59,0.6)',
  surfaceMuted: 'rgba(148,163,184,0.06)',

  border: 'rgba(148,163,184,0.12)',
  borderSoft: 'rgba(148,163,184,0.06)',

  text: '#e2e8f0',
  textDim: '#94a3b8',
  textMuted: '#64748b',
  textFaint: '#475569',

  primary: '#6366f1',
  primarySoft: '#818cf8',
  primaryTint: 'rgba(99,102,241,0.14)',
  primaryTintBorder: 'rgba(99,102,241,0.28)',
  primaryFaint: 'rgba(99,102,241,0.10)',

  amber: '#f59e0b',
  indigo: '#818cf8',
  emerald: '#10b981',
  rose: '#f43f5e',
  roseTint: 'rgba(244,63,94,0.10)',
  roseTintBorder: 'rgba(244,63,94,0.22)',
  roseText: '#fda4af',
};

export const lightTheme = {
  mode: 'light',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  surfaceMuted: 'rgba(15,23,42,0.04)',

  border: 'rgba(15,23,42,0.10)',
  borderSoft: 'rgba(15,23,42,0.06)',

  text: '#0F172A',
  textDim: '#334155',
  textMuted: '#64748b',
  textFaint: '#94a3b8',

  primary: '#4f46e5',
  primarySoft: '#6366f1',
  primaryTint: 'rgba(79,70,229,0.10)',
  primaryTintBorder: 'rgba(79,70,229,0.24)',
  primaryFaint: 'rgba(79,70,229,0.08)',

  amber: '#d97706',
  indigo: '#6366f1',
  emerald: '#059669',
  rose: '#e11d48',
  roseTint: 'rgba(225,29,72,0.08)',
  roseTintBorder: 'rgba(225,29,72,0.20)',
  roseText: '#be123c',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

const ThemeContext = createContext({
  theme: darkTheme,
  mode: 'dark',
  toggleTheme: () => {},
  setMode: () => {},
});

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (alive && (saved === 'dark' || saved === 'light')) {
          setModeState(saved);
        }
      } catch {
        // Non-fatal — fall back to default dark
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme: mode === 'dark' ? darkTheme : lightTheme,
      mode,
      toggleTheme,
      setMode,
    }),
    [mode, toggleTheme, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}