export type StateCategory = 'Focus' | 'Energy' | 'Stress' | 'Calm' | 'Overload' | 'Recovery';
export type DomainCategory = 'Work' | 'Personal' | 'Social' | 'Health' | 'Exercise' | 'Sleep' | 'Food';
export type EventType = 'PRODUCER' | 'CONSUMER' | 'SIGNAL' | 'NOISE';
export type ImpactDirection = 'INCREASE' | 'DECREASE' | 'NEUTRAL';

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
  userFeedback?: {
    isCorrected: boolean;
    correctedLabel?: string;
  };
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
  suggestedAction?: {
    label: string;
    actionType: CopingActionType;
  };
}
