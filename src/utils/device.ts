import { Platform } from 'react-native';

/** Journals are written on iPad (keyboard + Apple Pencil) and read everywhere else. */
export const canWriteJournal = Platform.OS === 'ios' && Platform.isPad;
