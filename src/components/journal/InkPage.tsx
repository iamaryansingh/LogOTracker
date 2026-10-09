import { Canvas, Line, Path, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import type { InkStroke } from '../../domain/types';
import { useTheme } from '../../theme';
import { inkColor, PAGE_ASPECT, strokePath } from './ink';

const RULE_SPACING = 0.055; // fraction of page width

export interface InkPageProps {
  strokes: InkStroke[];
  width: number;
  /** Faint ruled lines, like notebook paper. */
  ruled?: boolean;
  children?: React.ReactNode;
}

/** Renders a handwriting page at any width. Read-only; the editor layers its live stroke on top via `children`. */
export function InkPage({ strokes, width, ruled = true, children }: InkPageProps) {
  const { colors } = useTheme();
  const height = width * PAGE_ASPECT;

  const paths = useMemo(
    () => strokes.map((s) => ({ id: s.id, path: strokePath(s.points, width), color: inkColor(s.tone, colors), w: s.width * width })),
    [strokes, width, colors],
  );

  const rules = useMemo(() => {
    if (!ruled || width === 0) return [];
    const step = RULE_SPACING * width;
    return Array.from({ length: Math.floor(height / step) - 1 }, (_, i) => (i + 1.5) * step);
  }, [ruled, width, height]);

  if (width === 0) return null;
  return (
    <Canvas style={{ width, height }}>
      {rules.map((y) => (
        <Line key={y} p1={vec(0, y)} p2={vec(width, y)} color={colors.borderSubtle} strokeWidth={1} />
      ))}
      {paths.map((p) => (
        <Path key={p.id} path={p.path} color={p.color} style="stroke" strokeWidth={p.w} strokeCap="round" strokeJoin="round" />
      ))}
      {children}
    </Canvas>
  );
}
