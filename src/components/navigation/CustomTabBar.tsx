import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, useTheme } from '../../theme';
import { PressableScale, Text } from '../primitives';

/** Text-only tab bar with a small active dot, kept quiet on purpose. */
export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.borderSubtle,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name, route.params);
          }
        };

        return (
          <PressableScale
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            pressedScale={0.95}
            style={styles.tab}
          >
            <Text variant="caption" tone={focused ? 'primary' : 'secondary'}>
              {label}
            </Text>
            <View style={[styles.dot, { backgroundColor: focused ? colors.textPrimary : 'transparent' }]} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 44,
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
