import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '../../utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const spring = { damping: 18, stiffness: 320, mass: 0.6 };

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  haptic?: boolean;
}

/** Pressable with a soft spring scale on press-in; the shared press feel across the app. */
export function PressableScale({
  style,
  pressedScale = 0.98,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      style={[style, animatedStyle]}
      onPressIn={(e) => {
        scale.set(withSpring(pressedScale, spring));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withSpring(1, spring));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics.selection();
        onPress?.(e);
      }}
      {...rest}
    />
  );
}
