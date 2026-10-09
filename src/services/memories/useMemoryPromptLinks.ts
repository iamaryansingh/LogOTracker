import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { SNAP_CATEGORY } from './tracking';

// Show smart prompts as banners even if they arrive while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// "📸 Take photo" on the arrival prompt; tapping the prompt itself does the same.
Notifications.setNotificationCategoryAsync(SNAP_CATEGORY, [
  { identifier: 'take-photo', buttonTitle: '📸 Take photo', options: { opensAppToForeground: true } },
]).catch(() => undefined);

/** Tapping a smart prompt opens what it's about: the camera for a place, or that day's memory. */
export function useMemoryPromptLinks() {
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url;
      if (typeof url === 'string') void Linking.openURL(url);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
