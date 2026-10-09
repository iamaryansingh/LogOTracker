import type { LinkingOptions, NavigatorScreenParams } from '@react-navigation/native';
import * as Linking from 'expo-linking';

import { isNotesResultUrl } from '../services/appleNotes';

import type { CopingActionType } from '../domain/types';

export type RootTabParamList = {
  Today: undefined;
  Memories: undefined;
  Plans: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Tabs: NavigatorScreenParams<RootTabParamList>;
  /** Opened from Today's "What shaped your day". */
  Timeline: undefined;
  EventDetail: { eventId: string };
  JournalEntry: { logId: string };
  CopingSession: { action: CopingActionType };
  WeeklySummary: undefined;
  PrivacyCenter: undefined;
  Profile: undefined;
  Idea: { id?: string };
  Insights: undefined;
  Memory: { date: string };
  Trip: { id: string };
  MemoryPost: { id: string };
  /** Where to go next, parking spots, and regular places. */
  Places: undefined;
  /** Whoop & Apple Health: recovery, strain, sleep, vitals. */
  Health: undefined;
  /** Camera straight away; the photo is filed into today's memory for that place. */
  Snap: { lat?: string; lon?: string; name?: string } | undefined;
  /** New memory (optionally at a known place and day), or edit one by id. */
  MemoryCompose: { id?: string; date?: string; place?: { name: string; latitude: number; longitude: number; locality?: string; city?: string } };
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/')],
  // Shortcuts reports back through this link; it's handled by NotesResultBanner, not navigation.
  // The WHOOP sign-in redirect is caught by the auth session, not a screen.
  filter: (url) => !isNotesResultUrl(url) && !url.includes('://whoop'),
  config: {
    screens: {
      Tabs: { screens: { Today: 'today', Memories: 'memories', Plans: 'plans', Dev: 'dev' } },
      Timeline: 'timeline',
      Insights: 'insights',
      EventDetail: 'event/:eventId',
      JournalEntry: 'journal/:logId',
      CopingSession: 'cope/:action',
      WeeklySummary: 'week',
      PrivacyCenter: 'privacy',
      Profile: 'profile',
      Idea: 'idea/:id?',
      Memory: 'memory/:date',
      Trip: 'trip/:id',
      MemoryPost: 'post/:id',
      Places: 'places',
      Health: 'health',
      Snap: 'snap',
      MemoryCompose: 'new-memory',
    },
  },
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
