import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { CustomTabBar } from '../components/navigation/CustomTabBar';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { TodayScreen } from '../screens/TodayScreen';

export type RootTabParamList = {
  Today: undefined;
  Timeline: undefined;
  Insights: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const TimelineTab = () => <PlaceholderScreen title="Timeline" note="Your full day, arriving in Sprint 2." />;
const InsightsTab = () => <PlaceholderScreen title="Insights" note="Patterns and triggers, arriving in Sprint 3." />;
const ProfileTab = () => <PlaceholderScreen title="Profile" note="Privacy and inputs, arriving in Sprint 4." />;

export function RootTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Timeline" component={TimelineTab} />
      <Tab.Screen name="Insights" component={InsightsTab} />
      <Tab.Screen name="Profile" component={ProfileTab} />
    </Tab.Navigator>
  );
}
