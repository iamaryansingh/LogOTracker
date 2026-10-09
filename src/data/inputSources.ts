import type { InputSource } from '../domain/types';

export interface InputSourceInfo {
  source: InputSource;
  /** Why we'd like it, framed around the user's benefit rather than the permission. */
  purpose: string;
  reads: string;
  neverReads: string;
}

export const INPUT_SOURCES: InputSourceInfo[] = [
  {
    source: 'Calendar',
    purpose: 'Understand how your schedule affects your day',
    reads: 'When events start and end, and how many overlap',
    neverReads: 'Event notes, attendees, or anything outside your calendars',
  },
  {
    source: 'Health',
    purpose: 'Bring in steps, Move calories, workouts and sleep automatically',
    reads: 'Steps, active energy (Move), exercise minutes, workouts and sleep, from Apple Health or Health Connect, including what other apps save there',
    neverReads: 'Medical records, heart data, or any category you haven’t allowed',
  },
  {
    source: 'Motion',
    purpose: 'Notice when movement seems to lift your mood',
    reads: 'Whether you’re walking, still, or travelling, and step counts',
    neverReads: 'Where you are or where you go',
  },
  {
    source: 'Location',
    purpose: 'Tell apart time at work, at home, and outdoors',
    reads: 'Broad place types, only while the app is open',
    neverReads: 'Exact addresses. Your location history never leaves this phone',
  },
];
