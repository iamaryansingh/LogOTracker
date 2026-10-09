import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

export interface SimpleSparklineProps {
  /** `null` marks a day without data; the line breaks there instead of inventing a value. */
  values: (number | null)[];
  color: string;
  height?: number;
  /** Fixed value domain so lines are comparable across metrics. */
  min?: number;
  max?: number;
  accessibilityLabel?: string;
}

const STROKE = 2;
const DOT = 4;

/** A single quiet line with each point marked. No axes, no gridlines. */
export function SimpleSparkline({ values, color, height = 36, min = 1, max = 5, accessibilityLabel }: SimpleSparklineProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const points = useMemo(() => {
    if (width === 0 || values.length < 2) return [];
    const pad = DOT + 1;
    const span = max - min || 1;
    return values.map((v, i) =>
      v === null
        ? null
        : { x: pad + (i / (values.length - 1)) * (width - pad * 2), y: pad + (1 - (v - min) / span) * (height - pad * 2) },
    );
  }, [values, width, height, min, max]);

  const path = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    let drawing = false;
    for (const pt of points) {
      if (!pt) {
        drawing = false;
        continue;
      }
      if (drawing) builder.lineTo(pt.x, pt.y);
      else builder.moveTo(pt.x, pt.y);
      drawing = true;
    }
    return builder.detach();
  }, [points]);

  const dots = points.filter((p): p is { x: number; y: number } => p !== null);

  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {dots.length > 0 && (
        <Canvas style={{ width, height }}>
          <Path path={path} color={color} style="stroke" strokeWidth={STROKE} strokeCap="round" strokeJoin="round" />
          {dots.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === dots.length - 1 ? DOT : DOT - 1.5} color={color} />
          ))}
        </Canvas>
      )}
    </View>
  );
}
