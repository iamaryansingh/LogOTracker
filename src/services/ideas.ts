import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform, Share } from 'react-native';

import type { DevIdea } from '../domain/types';

/** Screenshots live in the app's own folder, so they stay attached even if deleted from Photos. */
const folder = () => {
  const dir = new Directory(Paths.document, 'ideas');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
};

const newName = (ext: string) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

export const imageUri = (name: string) => new File(folder(), name).uri;

async function keep(uri: string): Promise<string> {
  const ext = (uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const name = newName(ext === 'heic' ? 'heic' : ext);
  await new File(uri).copy(new File(folder(), name));
  return name;
}

export function deleteImages(names: string[]) {
  for (const n of names) {
    try {
      const f = new File(folder(), n);
      if (f.exists) f.delete();
    } catch {
      // Already gone.
    }
  }
}

/** Pick any number of images from Photos. Returns stored file names (empty if cancelled). */
export async function pickImages(): Promise<string[]> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
  if (result.canceled) return [];
  return Promise.all(result.assets.map((a) => keep(a.uri)));
}

export type LatestScreenshot = { name: string } | { error: 'denied' | 'none' };

/** Attaches the most recent screenshot in Photos — take one, then come here and tap once. */
export async function attachLatestScreenshot(): Promise<LatestScreenshot> {
  const perm = await MediaLibrary.requestPermissionsAsync(false);
  if (!perm.granted) return { error: 'denied' };
  const page = await MediaLibrary.getAssetsAsync({
    first: 1,
    mediaType: 'photo',
    mediaSubtypes: ['screenshot'],
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  const asset = page.assets[0];
  if (!asset) return { error: 'none' };
  const info = await MediaLibrary.getAssetInfoAsync(asset);
  const uri = info.localUri ?? asset.uri;
  return { name: await keep(uri) };
}

/** The app and device it was noticed on, so the note still makes sense later. */
export function contextLine(idea: DevIdea): string {
  const device = Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : 'Android';
  const os = `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`;
  const when = new Date(idea.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Self Mirror ${Constants.expoConfig?.version ?? ''} · ${device} · ${os} · ${when}`;
}

export function ideaAsText(idea: DevIdea): string {
  const head = `[Scope of improvement] ${idea.kind}${idea.screen ? ` · ${idea.screen}` : ''}${idea.done ? ' · done' : ''}`;
  const shots = idea.images.length ? `${idea.images.length} screenshot${idea.images.length > 1 ? 's' : ''} attached` : '';
  return [head, idea.text.trim(), shots, `— ${contextLine(idea)}`].filter(Boolean).join('\n\n');
}

export const copyText = (idea: DevIdea) => Clipboard.setStringAsync(ideaAsText(idea));

export async function copyImage(name: string): Promise<void> {
  await Clipboard.setImageAsync(await new File(folder(), name).base64());
}

/** Share sheet with the text and the first screenshot (iOS shares both together). */
export async function shareIdea(idea: DevIdea): Promise<void> {
  const url = idea.images[0] ? imageUri(idea.images[0]) : undefined;
  await Share.share(url ? { message: ideaAsText(idea), url } : { message: ideaAsText(idea) });
}
