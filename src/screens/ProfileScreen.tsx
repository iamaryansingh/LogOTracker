import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { Button, Card, ListRow, SegmentedTabs, SelectablePill, Text } from '../components/primitives';
import { createNoteEntry } from '../domain/events';
import { appleNotesSupported, NOTES_FOLDER, NOTES_SHORTCUT, sendToAppleNotes } from '../services/appleNotes';
import { REMINDERS_LIST, remindersSupported } from '../services/reminders';
import { HomeCard } from '../components/memories/HomeCard';
import { MemoriesSetupCard } from '../components/memories/MemoriesSetupCard';
import { exportBackup, pickBackup, summarize } from '../services/backup';
import { clearEnrichmentCaches } from '../services/memories/enrich';
import { clearPoints } from '../services/memories/points';
import { enablePrompts, memoriesSupported } from '../services/memories/tracking';
import { STYLES } from './MemoryScreen';
import { useSync, type SyncState } from '../services/sync/SyncProvider';
import { useAppStore, type Appearance } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';

const APPEARANCES = ['system', 'light', 'dark'] as const satisfies readonly Appearance[];
const appearanceLabels: Record<Appearance, string> = { system: 'System', light: 'Light', dark: 'Dark' };

function syncDetail(state: SyncState, lastSyncedAt?: string): string {
  switch (state) {
    case 'unsupported':
      return 'Available in the installed app, not in Expo Go';
    case 'unavailable':
      return 'Sign in to iCloud in Settings, with iCloud Drive on';
    case 'off':
      return 'Off: entries and journals stay on this device';
    case 'syncing':
      return 'Syncing…';
    case 'error':
      return 'Couldn’t reach iCloud. Will retry';
    case 'idle':
      return lastSyncedAt
        ? `Up to date · ${new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
        : 'Keeps your iPad and iPhone in step';
  }
}

export function ProfileScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { inputs, appearance, setAppearance, setOnboarded, cloudSync, setCloudSync, remindersSync, setRemindersSync, appleNotes, setAppleNotes } = useAppStore();
  const sync = useSync();
  const store = useAppStore();
  const [confirmForget, setConfirmForget] = useState(false);
  const [backupNote, setBackupNote] = useState<{ text: string; tone: 'calm' | 'stressLow' | 'secondary' } | null>(null);
  const counts = summarize({ logs: store.logs, ratings: store.ratings, journals: store.journals, tasks: store.tasks, meta: store.meta, health: store.health });

  const backUp = async () => {
    try {
      await exportBackup({ logs: store.logs, ratings: store.ratings, journals: store.journals, tasks: store.tasks, meta: store.meta, health: store.health });
      setBackupNote({ text: 'Backup created. Save it to Files or iCloud Drive, or AirDrop it to your iPad.', tone: 'secondary' });
    } catch {
      setBackupNote({ text: 'Couldn’t create the backup. Try again.', tone: 'stressLow' });
    }
  };

  const restore = async () => {
    try {
      const picked = await pickBackup();
      if (!picked) return;
      store.importBackup(picked.records, picked.health);
      haptics.success();
      const s = picked.summary;
      setBackupNote({
        text: `Merged a backup from ${new Date(picked.exportedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: ${s.entries} entries, ${s.journals} journals, ${s.todos} to-dos, ${s.days} rated days. Newer changes on this device were kept.`,
        tone: 'calm',
      });
    } catch (e) {
      setBackupNote({ text: e instanceof Error ? e.message : 'Couldn’t read that backup.', tone: 'stressLow' });
    }
  };
  const activeInputs = Object.entries(inputs)
    .filter(([, on]) => on)
    .map(([name]) => name);

  return (
    <ScrollView
      style={{ backgroundColor: colors.bgSurface }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
    >
      <ScreenHeader title="You" caption="Settings and your data" navAction={{ label: 'Back', onPress: navigation.goBack }} />

      <Card padded={false} style={styles.group}>
        <ListRow title="This week" detail="A compressed look at the last 7 days" onPress={() => navigation.navigate('WeeklySummary')} />
        <ListRow
          title="Privacy Center"
          detail={activeInputs.length > 0 ? `Using ${activeInputs.join(', ')}` : 'No inputs on yet'}
          onPress={() => navigation.navigate('PrivacyCenter')}
          isLast
        />
      </Card>

      <Card padded={false} style={styles.group}>
        <ListRow
          title="iCloud sync"
          detail={syncDetail(sync.state, sync.lastSyncedAt)}
          isLast={!cloudSync || sync.state === 'unsupported'}
          right={
            <Switch
              value={cloudSync}
              onValueChange={setCloudSync}
              disabled={sync.state === 'unsupported'}
              trackColor={{ true: colors.state.calm, false: colors.borderSubtle }}
              accessibilityLabel="iCloud sync"
            />
          }
        />
        {cloudSync && sync.state !== 'unsupported' && <ListRow title="Sync now" onPress={sync.syncNow} isLast />}
      </Card>

      {(remindersSupported || appleNotesSupported) && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Apple apps
          </Text>
          <Card padded={false} style={styles.group}>
            {remindersSupported && (
              <ListRow
                title="Reminders"
                detail={`To-dos go to your “${REMINDERS_LIST}” list and stay in step both ways, including on your iPad.`}
                right={<Switch value={remindersSync} onValueChange={setRemindersSync} trackColor={{ true: colors.state.calm, false: colors.borderSubtle }} accessibilityLabel="Sync to-dos with Reminders" />}
              />
            )}
            <ListRow
              title="Calendar"
              detail="Dates in your notes become events in your default calendar. Always on; switch off any suggestion before saving."
              isLast={!appleNotesSupported}
            />
            {appleNotesSupported && (
              <ListRow
                title="Notes"
                detail={`New notes are also saved to the “${NOTES_FOLDER}” folder in Apple Notes.`}
                isLast
                right={<Switch value={appleNotes} onValueChange={setAppleNotes} trackColor={{ true: colors.state.calm, false: colors.borderSubtle }} accessibilityLabel="Save notes to Apple Notes" />}
              />
            )}
          </Card>
          {appleNotes && (
            <Card style={styles.setup}>
              <Text variant="bodyMedium">One-time setup for Apple Notes</Text>
              <Text variant="body" tone="secondary">
                Apple doesn’t let apps write to Notes directly, so each note goes through a Shortcut you make once. After
                that it’s automatic: Shortcuts flashes open, saves the note, and comes straight back.
              </Text>
              <Text variant="body">1. In Notes, create a folder named “{NOTES_FOLDER}”.</Text>
              <Text variant="body">2. In Shortcuts, tap +. Rename the shortcut to exactly “{NOTES_SHORTCUT}”.</Text>
              <Text variant="body">3. Tap the ⓘ (details) and turn on “Show in Share Sheet”. That lets it receive text. Set “Receives” to Text only.</Text>
              <Text variant="body">4. Add the action “Create Note”. Tap its text field and choose “Shortcut Input”. Tap the folder and pick “{NOTES_FOLDER}”.</Text>
              <Text variant="body">5. Tap the › on that action and turn OFF “Show Compose Sheet”. If it’s left on, Notes waits for you to tap Done.</Text>
              <Text variant="body">6. Come back and tap “Send a test note”. The first time, Shortcuts asks to access Notes: tap “Always Allow”.</Text>
              <Button label="Send a test note" variant="secondary" onPress={() => void sendToAppleNotes(createNoteEntry(`Self Mirror test note\nIf this is in your “${NOTES_FOLDER}” folder, notes are set up.`, new Date(), 'selfmirror-test'))} />
              <Text variant="caption" tone="secondary">
                After each note, a banner here tells you whether it saved. If it didn’t, it shows Shortcuts’ reason and offers to
                share the note to Notes instead.
              </Text>
            </Card>
          )}
        </View>
      )}

      {memoriesSupported && (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            Memories
          </Text>
          {!store.memories.enabled ? (
            <MemoriesSetupCard />
          ) : (
            <>
              <HomeCard />
              <Card padded={false} style={styles.group}>
                <ListRow
                  title="Smart prompts"
                  detail="When you arrive somewhere (not home), a tap opens the camera to snap it into today’s memory. Never overnight, at most 3 a day."
                  right={
                    <Switch
                      value={store.memories.prompts}
                      onValueChange={async (v) => {
                        if (v && !(await enablePrompts())) return;
                        store.setMemorySettings({ prompts: v });
                      }}
                      trackColor={{ true: colors.state.calm, false: colors.borderSubtle }}
                      accessibilityLabel="Smart prompts"
                    />
                  }
                />
                <ListRow
                  title="Weather"
                  detail="Adds the weather to each place. Sends only a rounded location (about 1 km) to Open-Meteo; nothing else leaves your phone."
                  isLast
                  right={
                    <Switch
                      value={store.memories.weather}
                      onValueChange={(v) => store.setMemorySettings({ weather: v })}
                      trackColor={{ true: colors.state.calm, false: colors.borderSubtle }}
                      accessibilityLabel="Weather in memories"
                    />
                  }
                />
              </Card>
              <Card style={styles.setup}>
                <Text variant="caption" tone="secondary">
                  How memories are written
                </Text>
                <View style={styles.pills}>
                  {STYLES.map((s) => (
                    <SelectablePill key={s.value} label={s.label} selected={store.memories.style === s.value} onPress={() => store.setMemorySettings({ style: s.value })} />
                  ))}
                </View>
                <Text variant="caption" tone="secondary">
                  {
                    {
                      NARRATIVE_STORY: 'A few warm sentences about where the day took you.',
                      POETIC_MINIMAL: 'Short, quiet lines. More feeling than detail.',
                      GEN_Z_CASUAL: 'Lowercase, emoji, unfiltered. ok so today…',
                      RAW_BULLETS: 'Just the facts: times, places, distance.',
                    }[store.memories.style]
                  }{' '}
                  You can switch any single day from its memory.
                </Text>
              </Card>
              <Card style={styles.setup}>
                <Text variant="caption" tone="secondary">
                  Location history stays on this iPhone and older points are dropped after 60 days. Your memories’ notes and pins
                  are kept.
                </Text>
                {confirmForget ? (
                  <View style={styles.buttonRow}>
                    <Button label="Keep" variant="secondary" style={styles.flex} onPress={() => setConfirmForget(false)} />
                    <Button
                      label="Forget it all"
                      style={[styles.flex, { backgroundColor: colors.state.stressHigh }]}
                      onPress={async () => {
                        await clearPoints();
                        await clearEnrichmentCaches();
                        setConfirmForget(false);
                        haptics.warning();
                      }}
                    />
                  </View>
                ) : (
                  <Button label="Delete location history" variant="secondary" onPress={() => setConfirmForget(true)} />
                )}
                <MemoriesSetupCard />
              </Card>
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Backup & restore
        </Text>
        <Card style={styles.setup}>
          <Text variant="body" tone="secondary">
            {counts.entries} entries, {counts.journals} journals and {counts.todos} to-dos on this device. A backup is one file you
            keep in Files or iCloud Drive. Restoring merges it in, and the newest version of each item wins, so nothing newer is
            lost.
          </Text>
          <Text variant="caption" tone="secondary">
            Back up before deleting or reinstalling the app. To copy everything to your other device, back up, AirDrop the file,
            and restore it there.
          </Text>
          <View style={styles.buttonRow}>
            <Button label="Back up" style={styles.flex} onPress={backUp} />
            <Button label="Restore" variant="secondary" style={styles.flex} onPress={restore} />
          </View>
          {backupNote && (
            <Text variant="caption" tone={backupNote.tone}>
              {backupNote.text}
            </Text>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <Text variant="sectionTitle" accessibilityRole="header">
          Appearance
        </Text>
        <SegmentedTabs options={APPEARANCES} value={appearance} onChange={setAppearance} labels={appearanceLabels} />
      </View>

      <Card padded={false} style={styles.group}>
        <ListRow title="Replay the introduction" onPress={() => setOnboarded(false)} isLast />
      </Card>

      <Text variant="caption" tone="secondary" style={styles.version}>
        Self Mirror {Constants.expoConfig?.version ?? ''}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  group: {
    paddingHorizontal: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  setup: {
    gap: spacing.xs,
  },
  version: {
    textAlign: 'center',
  },
});
