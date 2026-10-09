import { requireOptionalNativeModule } from 'expo';

export interface PhotoDescription {
  /** Apple Vision's scene labels, most confident first, e.g. "beach", "food", "dog". */
  labels: { id: string; confidence: number }[];
  faces: number;
}

interface SelfMirrorVisionNative {
  describe(uri: string): Promise<PhotoDescription>;
}

// Optional so the app still runs where the module isn't built in (Expo Go, Android, older builds).
const native = requireOptionalNativeModule<SelfMirrorVisionNative>('SelfMirrorVision');

export default native;
