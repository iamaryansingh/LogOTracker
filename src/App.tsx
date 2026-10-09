import { Caveat_600SemiBold, Caveat_700Bold } from '@expo-google-fonts/caveat';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NotesResultBanner } from './components/composite/NotesResultBanner';
import { CaptureProvider } from './components/composite/QuickCaptureBottomSheet';
import { RootNavigator } from './navigation/RootNavigator';
import { linking } from './navigation/types';
import { useHealthSync } from './services/health/useHealthSync';
import { MemoriesProvider } from './services/memories/MemoriesProvider';
import { useMemoryPromptLinks } from './services/memories/useMemoryPromptLinks';
import { useRemindersSync } from './services/useRemindersSync';
import { SyncProvider } from './services/sync/SyncProvider';
import { AppStoreProvider, useAppStore } from './state/AppStore';
import { ThemeProvider, useTheme } from './theme';

/** Feeds the stored appearance preference into the theme. */
function AppearanceBridge({ children }: { children: ReactNode }) {
  const { appearance } = useAppStore();
  return <ThemeProvider override={appearance === 'system' ? undefined : appearance}>{children}</ThemeProvider>;
}

function ThemedApp() {
  const { scheme, colors } = useTheme();
  // Handwriting for memory captions; text falls back to the system font until it loads.
  useFonts({ Caveat_600SemiBold, Caveat_700Bold });
  const { hydrated } = useAppStore();
  useHealthSync();
  useRemindersSync();
  useMemoryPromptLinks();
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

  // Hold on a blank surface until stored state loads, so onboarding never flashes for returning users.
  if (!hydrated) return <View style={[styles.fill, { backgroundColor: colors.bgSurface }]} />;

  return (
    <SyncProvider>
      <MemoriesProvider>
      <BottomSheetModalProvider>
        <CaptureProvider>
          <NavigationContainer theme={navTheme} linking={linking}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <RootNavigator />
          </NavigationContainer>
          <NotesResultBanner />
        </CaptureProvider>
      </BottomSheetModalProvider>
      </MemoriesProvider>
    </SyncProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <AppStoreProvider>
          <AppearanceBridge>
            <ThemedApp />
          </AppearanceBridge>
        </AppStoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
