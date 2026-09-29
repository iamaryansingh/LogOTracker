import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, stateColors, type SurfacePalette } from './colors';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: SurfacePalette & { state: typeof stateColors };
}

const buildTheme = (scheme: 'light' | 'dark'): Theme => ({
  scheme,
  colors: { ...(scheme === 'dark' ? darkPalette : lightPalette), state: stateColors },
});

const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
