import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { typography, useTheme, type StateToken, type TypographyVariant } from '../../theme';

export type TextTone = 'primary' | 'secondary' | StateToken;

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
}

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const color =
    tone === 'primary' ? colors.textPrimary : tone === 'secondary' ? colors.textSecondary : colors.state[tone];

  return <RNText style={[typography[variant], { color }, style]} {...rest} />;
}
