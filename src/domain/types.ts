export type StateCategory = 'Focus' | 'Energy' | 'Stress' | 'Calm' | 'Overload' | 'Recovery';
export type DomainCategory = 'Work' | 'Personal' | 'Social' | 'Health' | 'Exercise' | 'Sleep' | 'Food';
export type EventType = 'PRODUCER' | 'CONSUMER' | 'SIGNAL' | 'NOISE';
export type ImpactDirection = 'INCREASE' | 'DECREASE' | 'NEUTRAL';
/** AUTO = inferred from passive signals, MANUAL = a quick capture the user logged. */
export type EventSource = 'AUTO' | 'MANUAL';

export interface SignalEvent {
  id: string;
  timestampStart: string; // ISO string
  timestampEnd: string; // ISO string
  title: string;
  subtitle?: string;
  domain: DomainCategory;
  eventType: EventType;
  inferredStateImpact: {
    targetState: StateCategory;
    direction: ImpactDirection;
    magnitude: number; // 0.0 – 1.0
  };
  confidenceScore: number; // 0.0 – 1.0
  source?: EventSource;
  userFeedback?: UserFeedback;
  /** Free-text note written alongside the entry. */
  note?: string;
  /** A standalone note or reminder on the timeline, rather than an activity. */
  isNote?: boolean;
  /** What was created from the note, so re-saving never duplicates it. */
  links?: EntryLinks;
}

export interface CalendarLink {
  /** The note line this came from. */
  line: string;
  title: string;
  start: string; // ISO
  allDay: boolean;
  status: 'added' | 'failed';
  /** Device calendar event id, when added. */
  eventId?: string;
}

export interface AlarmLink {
  line: string;
  title: string;
  at: string; // ISO
  status: 'set' | 'failed' | 'cancelled';
  /** AlarmKit id, when set. */
  alarmId?: string;
}

export interface EntryLinks {
  calendar?: CalendarLink[];
  alarms?: AlarmLink[];
  taskIds?: string[];
  /** Note lines already turned into something, skipped on later edits. */
  handledLines?: string[];
  /** When the note was sent to Apple Notes, so an edit doesn't send it twice. */
  sentToNotesAt?: string;
}

export interface Task {
  id: string;
  text: string;
  due?: string; // ISO
  dueHasTime: boolean;
  done: boolean;
  doneAt?: string;
  /** The entry whose note this came from. */
  sourceLogId?: string;
  /** The note line it was read from, kept for context in Reminders. */
  sourceLine?: string;
  createdAt: string;
}

export interface UserFeedback {
  isCorrected: boolean;
  correctedLabel?: string;
  /** The state the user says this event actually affected. */
  correctedState?: StateCategory;
  /** The user says this event didn't meaningfully affect them. */
  markedIrrelevant?: boolean;
}

export type LoadLevel = 'Light' | 'Moderate' | 'Heavy' | 'Extreme';

/** 1–5 scale used by the daily metric meter. */
export type MetricValue = 1 | 2 | 3 | 4 | 5;

export interface DailySummary {
  date: string; // YYYY-MM-DD
  overallLoad: LoadLevel;
  metrics: {
    energy: MetricValue;
    focus: MetricValue;
    stress: MetricValue;
  };
  shapingEvents: SignalEvent[];
  primaryInsight?: InsightCardData;
}

export type InsightType = 'PATTERN' | 'TRIGGER' | 'RECOVERY' | 'CHANGE' | 'REFLECTION';
export type CopingActionType = 'WALK' | 'BREATHE' | 'DISCONNECT';

export interface InsightCardData {
  id: string;
  type: InsightType;
  headline: string;
  body: string;
  evidenceCount: number;
  /** What evidenceCount counts; defaults to events. */
  evidenceUnit?: 'events' | 'days';
  suggestedAction?: {
    label: string;
    actionType: CopingActionType;
  };
  /** 0–1, used to order the insights feed. */
  relevance?: number;
  observedAt?: string; // ISO string
}

export type MoodLevel = 'Good' | 'Okay' | 'Neutral' | 'Stressed' | 'Overwhelmed';

export type InputSource = 'Calendar' | 'Health' | 'Motion' | 'Location';

export interface DaySnapshot {
  date: string; // YYYY-MM-DD
  load: LoadLevel;
  energy: MetricValue;
  focus: MetricValue;
  stress: MetricValue;
}

/** The user's own 1–5 rating of their day. Any metric may be left unrated. */
export interface DayRatings {
  energy?: MetricValue;
  focus?: MetricValue;
  stress?: MetricValue;
}

export type RatingKey = keyof DayRatings;

// ---- Journal ------------------------------------------------------------------------

export type InkTone = 'ink' | 'blue' | 'sage' | 'rust';

/** One pen stroke. Points are flat [x, y, x, y, …] normalized to the page width, so pages scale to any screen. */
export interface InkStroke {
  id: string;
  points: number[];
  /** Line width as a fraction of page width. */
  width: number;
  tone: InkTone;
}

/** A journal attached to one log entry. Written on iPad, readable everywhere. */
export interface JournalEntry {
  logId: string;
  text: string;
  pages: InkStroke[][];
  updatedAt: string; // ISO string
}

// ---- Developer board ------------------------------------------------------------------

export type IdeaKind = 'Bug' | 'Idea' | 'Polish';

/** A bug or improvement noted while using the app. Kept apart from notes; never routed anywhere. */
export interface DevIdea {
  id: string;
  kind: IdeaKind;
  text: string;
  /** File names of screenshots stored in the app's own documents folder. */
  images: string[];
  /** Where in the app it was noticed, e.g. "Timeline". */
  screen?: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}
