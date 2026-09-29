import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootTabs } from './navigation/RootTabs';
import { ThemeProvider, useTheme } from './theme';

function ThemedNavigation() {
  const { scheme, colors } = useTheme();
  const navTheme = useMemo<NavTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bgSurface,
        card: colors.bgCard,
        text: colors.textPrimary,
        border: colors.borderSubtle,
        primary: colors.textPrimary,
      },
    };
  }, [scheme, colors]);

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootTabs />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedNavigation />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
