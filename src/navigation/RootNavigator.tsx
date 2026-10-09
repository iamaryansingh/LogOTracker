import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { CopingSessionScreen } from '../screens/CopingSessionScreen';
import { EventDetailModal } from '../screens/EventDetailModal';
import { HealthScreen } from '../screens/HealthScreen';
import { IdeaScreen } from '../screens/IdeaScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { JournalEntryScreen } from '../screens/JournalEntryScreen';
import { MemoryComposeScreen } from '../screens/MemoryComposeScreen';
import { MemoryPostScreen } from '../screens/MemoryPostScreen';
import { PlacesScreen } from '../screens/PlacesScreen';
import { SnapScreen } from '../screens/SnapScreen';
import { MemoryScreen } from '../screens/MemoryScreen';
import { TimelineScreen } from '../screens/TimelineScreen';
import { TripScreen } from '../screens/TripScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PrivacyCenterScreen } from '../screens/PrivacyCenterScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WeeklySummaryScreen } from '../screens/WeeklySummaryScreen';
import { useAppStore } from '../state/AppStore';
import { useTheme } from '../theme';
import { canWriteJournal } from '../utils/device';
import { RootTabs } from './RootTabs';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { colors } = useTheme();
  const { onboarded } = useAppStore();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bgSurface } }}>
      {/* Swapping the screen set (rather than navigating) means back can never return to onboarding. */}
      {onboarded ? (
        <>
          <Stack.Screen name="Tabs" component={RootTabs} />
          <Stack.Screen name="Timeline" component={TimelineScreen} />
          <Stack.Screen name="EventDetail" component={EventDetailModal} options={{ presentation: 'modal' }} />
          {/* Writing wants the whole iPad screen; reading on iPhone is a regular pushed page. */}
          <Stack.Screen
            name="JournalEntry"
            component={JournalEntryScreen}
            options={canWriteJournal ? { presentation: 'fullScreenModal', gestureEnabled: false } : undefined}
          />
          <Stack.Screen
            name="CopingSession"
            component={CopingSessionScreen}
            options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
          />
          <Stack.Screen name="WeeklySummary" component={WeeklySummaryScreen} />
          <Stack.Screen name="PrivacyCenter" component={PrivacyCenterScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Idea" component={IdeaScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="Memory" component={MemoryScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="Trip" component={TripScreen} />
          <Stack.Screen name="Places" component={PlacesScreen} />
          <Stack.Screen name="Snap" component={SnapScreen} options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="Health" component={HealthScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="MemoryPost" component={MemoryPostScreen} options={{ presentation: 'modal' }} />
          <Stack.Screen name="MemoryCompose" component={MemoryComposeScreen} options={{ presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="Insights" component={InsightsScreen} />
        </>
      ) : (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
      )}
    </Stack.Navigator>
  );
}
