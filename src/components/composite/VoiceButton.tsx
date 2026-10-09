import Ionicons from '@expo/vector-icons/Ionicons';
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radii, spacing, useTheme, withAlpha } from '../../theme';
import { haptics } from '../../utils/haptics';
import { PressableScale, Text } from '../primitives';

type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;

// Loaded lazily so builds without the native module (Expo Go) still run; the button just hides.
function loadSpeech(): SpeechModule | null {
  // Check for the native side first: requiring the package without it throws at import time.
  if (!requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-speech-recognition') as typeof import('expo-speech-recognition')).ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(' ');

export interface VoiceButtonProps {
  /** Current field text; speech is added after it. */
  value: string;
  onChange: (next: string) => void;
}

/** Tap to speak: words appear in the field as you talk. Tap again (or pause) to stop. */
export function VoiceButton({ value, onChange }: VoiceButtonProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [speech] = useState(loadSpeech);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pulse = useSharedValue(1);
  const session = useRef({ base: '', committed: '' });
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('result', (e) => {
        const transcript = e.results[0]?.transcript ?? '';
        const s = session.current;
        if (e.isFinal) {
          s.committed = join(s.committed, transcript);
          onChangeRef.current(join(s.base, s.committed));
        } else {
          onChangeRef.current(join(s.base, s.committed, transcript));
        }
      }),
      speech.addListener('end', () => setListening(false)),
      speech.addListener('error', (e) => {
        setListening(false);
        if (e.error === 'aborted' || e.error === 'no-speech') return;
        setError(e.error === 'not-allowed' ? 'Allow the microphone and speech recognition in Settings.' : 'Couldn’t hear that. Try again.');
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      speech.abort();
    };
  }, [speech]);

  useEffect(() => {
    if (listening && !reduceMotion) pulse.set(withRepeat(withTiming(0.45, { duration: 700 }), -1, true));
    else {
      cancelAnimation(pulse);
      pulse.set(1);
    }
  }, [listening, reduceMotion, pulse]);

  const ring = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  if (!speech) return null;

  const toggle = async () => {
    haptics.selection();
    setError(null);
    if (listening) {
      speech.stop();
      return;
    }
    const perm = await speech.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Allow the microphone and speech recognition in Settings to speak notes.');
      return;
    }
    session.current = { base: value, committed: '' };
    speech.start({
      lang: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      // Keep audio on the device when the language model is available there.
      requiresOnDeviceRecognition: speech.supportsOnDeviceRecognition(),
      iosTaskHint: 'dictation',
    });
    setListening(true);
  };

  const accent = colors.state.stressHigh;
  return (
    <View style={styles.wrap}>
      <PressableScale
        onPress={toggle}
        pressedScale={0.9}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={listening ? 'Stop dictation' : 'Speak a note'}
        accessibilityState={{ selected: listening }}
        style={[styles.button, { backgroundColor: listening ? withAlpha(accent, 0.14) : colors.bgSurface, borderColor: listening ? accent : colors.borderSubtle }]}
      >
        {listening && <Animated.View style={[StyleSheet.absoluteFill, styles.ring, { borderColor: accent }, ring]} />}
        <Ionicons name={listening ? 'stop' : 'mic'} size={18} color={listening ? accent : colors.textSecondary} />
      </PressableScale>
      {(listening || error) && (
        <Text variant="caption" tone={error ? 'stressLow' : 'secondary'} style={styles.status} numberOfLines={2}>
          {error ?? 'Listening… tap to stop'}
        </Text>
      )}
    </View>
  );
}

const SIZE = 36;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  status: {
    flexShrink: 1,
  },
});
