import { Platform, type TextStyle } from 'react-native';

// System font resolves to SF Pro on iOS and Roboto on Android.
const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });

export const typography = {
  headerLarge: { fontFamily, fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5 },
  sectionTitle: { fontFamily, fontSize: 18, lineHeight: 24, fontWeight: '500' },
  body: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyMedium: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  caption: { fontFamily, fontSize: 12, lineHeight: 16, fontWeight: '500' },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
