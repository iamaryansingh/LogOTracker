import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/composite/ScreenHeader';
import { Button, LevelBar, Text } from '../components/primitives';
import { createCopingEvent } from '../domain/events';
import type { CopingActionType } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme, withAlpha, type StateToken } from '../theme';
import { haptics } from '../utils/haptics';
import { formatCountdown } from '../utils/time';

interface SessionConfig {
  title: string;
  intro: string;
  steps: string[];
  seconds: number;
  token: StateToken;
}

const SESSIONS: Record<CopingActionType, SessionConfig> = {
  BREATHE: {
    title: 'Breathe',
    intro: 'One minute of slower breathing. Follow the circle.',
    steps: ['Breathe in as it grows', 'Breathe out, slowly, as it settles'],
    seconds: 60,
    token: 'calm',
  },
  WALK: {
    title: 'Take a walk',
    intro: 'Ten minutes away from your desk. Any pace is fine.',
    steps: ['Leave your phone in your pocket', 'Notice what’s around you', 'Come back when the timer ends'],
    seconds: 10 * 60,
    token: 'energy',
  },
  DISCONNECT: {
    title: 'Disconnect',
    intro: 'Fifteen minutes without screens.',
    steps: ['Put your phone face down', 'Step away from notifications', 'We’ll be here when you’re back'],
    seconds: 15 * 60,
    token: 'focus',
  },
};

const INHALE_MS = 4000;
const EXHALE_MS = 6000;
/** Sessions shorter than this aren't logged, so a mis-tap doesn't pollute the timeline. */
const MIN_LOGGED_SECONDS = 30;

type Phase = 'ready' | 'running' | 'done';

export function CopingSessionScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'CopingSession'>) {
  const { action } = route.params;
  const config = SESSIONS[action];
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveLog } = useAppStore();
  const color = colors.state[config.token];

  const [phase, setPhase] = useState<Phase>('ready');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<Date | null>(null);
  const breath = useSharedValue(0.55);

  const finish = (completed: boolean) => {
    const start = startedAt.current;
    const seconds = start ? (Date.now() - start.getTime()) / 1000 : 0;
    cancelAnimation(breath);
    if (start && seconds >= MIN_LOGGED_SECONDS) saveLog(createCopingEvent(action, start));
    if (completed) haptics.success();
    setPhase('done');
  };

  // Elapsed time is derived from the start timestamp, so it stays correct if the app is backgrounded.
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      const start = startedAt.current;
      if (!start) return;
      const next = (Date.now() - start.getTime()) / 1000;
      setElapsed(next);
      if (next >= config.seconds) {
        clearInterval(id);
        finish(true);
      }
    }, 250);
    return () => clearInterval(id);
    // finish is recreated each render; the interval only needs to restart when the phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => cancelAnimation(breath), [breath]);

  const start = () => {
    startedAt.current = new Date();
    setElapsed(0);
    setPhase('running');
    haptics.light();
    if (action === 'BREATHE') {
      breath.set(
        withRepeat(
          withSequence(
            withTiming(1, { duration: INHALE_MS, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.55, { duration: EXHALE_MS, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        ),
      );
    }
  };

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: breath.get() }] }));
  const remaining = config.seconds - elapsed;
  const cycleMs = (elapsed * 1000) % (INHALE_MS + EXHALE_MS);
  const breathingIn = cycleMs < INHALE_MS;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface, paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScreenHeader
        title={config.title}
        caption={config.intro}
        navAction={phase === 'running' ? undefined : { label: 'Close', onPress: navigation.goBack }}
      />

      <View style={styles.center}>
        {phase === 'done' ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.doneText}>
            <Text variant="headerLarge">Nicely done</Text>
            <Text variant="body" tone="secondary" style={styles.centerText}>
              {elapsed >= MIN_LOGGED_SECONDS
                ? 'This moment was added to your timeline as recovery.'
                : 'Even a short pause counts. Come back any time.'}
            </Text>
          </Animated.View>
        ) : action === 'BREATHE' ? (
          <View style={styles.breathColumn}>
            <View style={styles.breathWrap}>
              <Animated.View style={[styles.breathCircle, { backgroundColor: withAlpha(color, 0.18), borderColor: withAlpha(color, 0.5) }, circleStyle]} />
              {phase === 'running' && (
                <Text variant="sectionTitle" style={{ color }}>
                  {breathingIn ? 'Breathe in' : 'Breathe out'}
                </Text>
              )}
            </View>
            <Text variant="caption" tone="secondary">
              {phase === 'running' ? `${formatCountdown(remaining)} left` : 'Ready when you are'}
            </Text>
          </View>
        ) : (
          <View style={styles.timer}>
            <Text style={[styles.countdown, { color: colors.textPrimary }]} accessibilityLabel={`${Math.ceil(remaining / 60)} minutes remaining`}>
              {formatCountdown(remaining)}
            </Text>
            <LevelBar value={elapsed / config.seconds} color={color} />
            <View style={styles.steps}>
              {config.steps.map((s) => (
                <Text key={s} variant="body" tone="secondary" style={styles.centerText}>
                  {s}
                </Text>
              ))}
            </View>
          </View>
        )}
      </View>

      {phase === 'ready' && <Button label="Begin" onPress={start} />}
      {phase === 'running' && <Button label={action === 'WALK' ? 'I’m back' : 'End'} variant="secondary" onPress={() => finish(false)} />}
      {phase === 'done' && <Button label="Back to my day" onPress={navigation.goBack} />}
    </View>
  );
}

const BREATH_SIZE = 220;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: screenPadding,
    gap: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  breathWrap: {
    width: BREATH_SIZE,
    height: BREATH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathCircle: {
    ...StyleSheet.absoluteFill,
    borderRadius: BREATH_SIZE / 2,
    borderWidth: 1,
  },
  breathColumn: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  timer: {
    alignSelf: 'stretch',
    gap: spacing.lg,
  },
  countdown: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '300',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  steps: {
    gap: spacing.xs,
  },
  doneText: {
    alignItems: 'center',
    gap: spacing.sm,
  },
});
