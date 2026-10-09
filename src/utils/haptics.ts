import * as Haptics from 'expo-haptics';

// Haptics are feedback, never a failure point: unsupported devices just stay silent.
const quiet = (p: Promise<void>) => void p.catch(() => {});

export const haptics = {
  selection: () => quiet(Haptics.selectionAsync()),
  light: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
