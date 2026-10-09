import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { CustomTabBar } from '../components/navigation/CustomTabBar';
import { DevScreen } from '../screens/DevScreen';
import { MemoriesScreen } from '../screens/MemoriesScreen';
import { PlansScreen } from '../screens/PlansScreen';
import { TodayScreen } from '../screens/TodayScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Memories" component={MemoriesScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
      <Tab.Screen name="Dev" component={DevScreen} />
    </Tab.Navigator>
  );
}
