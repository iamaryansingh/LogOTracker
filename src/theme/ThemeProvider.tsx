import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, memoryDark, memoryLight, stateColors, type MemoryPalette, type SurfacePalette } from './colors';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: SurfacePalette & { state: typeof stateColors; memory: MemoryPalette };
}

const buildTheme = (scheme: 'light' | 'dark'): Theme => ({
  scheme,
  colors: { ...(scheme === 'dark' ? darkPalette : lightPalette), state: stateColors, memory: scheme === 'dark' ? memoryDark : memoryLight },
});

const ThemeContext = createContext<Theme>(buildTheme('light'));

export interface ThemeProviderProps {
  children: ReactNode;
  /** Forces a scheme; omit to follow the system setting. */
  override?: 'light' | 'dark';
}

export function ThemeProvider({ children, override }: ThemeProviderProps) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const scheme = override ?? system;
  const theme = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
