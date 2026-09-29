import type { StateCategory } from '../../domain/types';
import { stateCategoryToken, useTheme } from '../../theme';
import { Chip } from './Chip';

export interface StateChipProps {
  category: StateCategory;
  direction?: 'UP' | 'DOWN';
}

const arrow = { UP: ' ↑', DOWN: ' ↓' } as const;
const spoken = { UP: 'rising', DOWN: 'easing' } as const;

export function StateChip({ category, direction }: StateChipProps) {
  const { colors } = useTheme();
  return (
    <Chip
      label={direction ? `${category}${arrow[direction]}` : category}
      color={colors.state[stateCategoryToken[category]]}
      accessibilityLabel={direction ? `${category} ${spoken[direction]}` : category}
    />
  );
}
