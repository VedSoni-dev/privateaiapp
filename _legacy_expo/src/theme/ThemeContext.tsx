import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors, type AppColorsType } from './colors';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = '@privateai/theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: AppColorsType;
  setMode: (mode: ThemeMode) => void;
}

// Defaults to light so there's zero flash-of-wrong-theme before the stored
// preference loads — matches the app's current (locked) system appearance.
const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  colors: LightColors,
  setMode: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    }).catch(() => {});
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    colors: mode === 'dark' ? DarkColors : LightColors,
    setMode,
  }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
