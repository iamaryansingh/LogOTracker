import { Platform, type TextStyle } from 'react-native';

// System font resolves to SF Pro on iOS and Roboto on Android.
const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' });

export const typography = {
  headerLarge: { fontFamily, fontSize: 28, lineHeight: 34, fontWeight: '600', letterSpacing: -0.5 },
  sectionTitle: { fontFamily, fontSize: 18, lineHeight: 24, fontWeight: '500' },
  body: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyMedium: { fontFamily, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  caption: { fontFamily, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  /** Handwritten captions on memory prints (Caveat, loaded at startup). */
  hand: { fontFamily: 'Caveat_600SemiBold', fontSize: 21, lineHeight: 24 },
  handTitle: { fontFamily: 'Caveat_700Bold', fontSize: 30, lineHeight: 34 },
} satisfies Record<string, TextStyle>;

/** The orange digits a disposable camera burns into the corner of the photo. */
export const dateStampFont: TextStyle = {
  fontFamily: Platform.select({ ios: 'Courier New', android: 'monospace', default: 'monospace' }),
  fontWeight: '700',
  fontSize: 11,
  letterSpacing: 1,
};

export type TypographyVariant = keyof typeof typography;
