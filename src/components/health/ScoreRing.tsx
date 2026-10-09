import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme, withAlpha } from '../../theme';
import { Text } from '../primitives';

export interface ScoreRingProps {
  /** 0…1 of the ring filled. */
  fraction: number;
  color: string;
  /** Big number in the middle, e.g. "72%" or "11.4". */
  value: string;
  label: string;
  size?: number;
}

/** A Whoop-style ring: a faint track and an arc for the score, the number in the middle. */
export function ScoreRing({ fraction, color, value, label, size = 104 }: ScoreRingProps) {
  const { colors } = useTheme();
  const stroke = size * 0.09;
  const { track, arc } = useMemo(() => {
    const rect = Skia.XYWHRect(stroke / 2, stroke / 2, size - stroke, size - stroke);
    const sweep = Math.max(0.001, Math.min(1, fraction)) * 360;
    return {
      track: Skia.PathBuilder.Make().addArc(rect, -90, 359.9).detach(),
      arc: Skia.PathBuilder.Make().addArc(rect, -90, sweep).detach(),
    };
  }, [fraction, size, stroke]);

  return (
    <View style={styles.wrap} accessible accessibilityRole="image" accessibilityLabel={`${label} ${value}`}>
      <View style={{ width: size, height: size }}>
        <Canvas style={{ width: size, height: size }}>
          <Path path={track} color={withAlpha(colors.textSecondary, 0.15)} style="stroke" strokeWidth={stroke} />
          <Path path={arc} color={color} style="stroke" strokeWidth={stroke} strokeCap="round" />
        </Canvas>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text variant="sectionTitle" style={{ fontSize: size * 0.22, lineHeight: size * 0.28 }}>
            {value}
          </Text>
        </View>
      </View>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
