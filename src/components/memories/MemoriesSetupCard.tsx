import { useState } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { enablePrompts, memoriesSupported, startTracking, stopTracking } from '../../services/memories/tracking';
import { useAppStore } from '../../state/AppStore';
import { spacing } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Text } from '../primitives';

/** Explains Memories and asks for "Always" location — the one permission the feature needs. */
export function MemoriesSetupCard() {
  const { memories, setMemorySettings } = useAppStore();
  const [problem, setProblem] = useState<string | null>(null);

  if (!memoriesSupported) {
    return (
      <Card>
        <Text variant="body" tone="secondary">
          Memories are collected on your iPhone, where you carry it through the day.
        </Text>
      </Card>
    );
  }

  const turnOn = async () => {
    setProblem(null);
    const r = await startTracking();
    if (!r.ok) {
      setProblem(
        r.reason === 'background-denied'
          ? 'Memories need location set to “Always”, so the day is noticed while the app is closed. Change it in Settings → Self Mirror → Location.'
          : 'Location access is off. Turn it on in Settings → Self Mirror → Location.',
      );
      return;
    }
    if (memories.prompts) await enablePrompts();
    setMemorySettings({ enabled: true });
    haptics.success();
  };

  if (memories.enabled) {
    return (
      <Button
        label="Pause Memories"
        variant="ghost"
        onPress={async () => {
          await stopTracking();
          setMemorySettings({ enabled: false });
        }}
      />
    );
  }

  return (
    <Card style={styles.card}>
      <Text variant="sectionTitle">Let your days write themselves</Text>
      <Text variant="body" tone="secondary">
        Self Mirror quietly notes where you spend time, using little battery, and turns each day into a short memory with its
        places, photos and mood. Trips are grouped on their own.
      </Text>
      <Text variant="caption" tone="secondary">
        Your location history stays on this iPhone. iOS will ask for location “While Using”, then “Always”, which is needed to
        notice the day while the app is closed.
      </Text>
      <Button label="Turn on Memories" onPress={turnOn} />
      {problem && (
        <>
          <Text variant="caption" tone="stressLow">
            {problem}
          </Text>
          <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
});
