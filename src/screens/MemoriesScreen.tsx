import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { MemoryCalendarView } from '../components/memories/MemoryCalendarView';
import { SegmentedTabs } from '../components/primitives';
import { spacing } from '../theme';
import { canWriteJournal } from '../utils/device';
import { JournalScreen } from './JournalScreen';

const MODES = ['Memories', 'Journal'] as const;
type Mode = (typeof MODES)[number];

/** The Memories tab: a calendar of remembered days, with the journal one switch away. */
export function MemoriesScreen() {
  // The iPad is where journals get written; the iPhone, carried all day, is where memories happen.
  const [mode, setMode] = useState<Mode>(canWriteJournal ? 'Journal' : 'Memories');
  const switcher = <SegmentedTabs options={MODES} value={mode} onChange={setMode} />;

  if (mode === 'Journal') return <JournalScreen switcher={switcher} />;
  return (
    <MemoryCalendarView
      header={
        <View style={styles.header}>
          <ScreenHeader title="Memories" caption={String(new Date().getFullYear())} />
          {switcher}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
  },
});
