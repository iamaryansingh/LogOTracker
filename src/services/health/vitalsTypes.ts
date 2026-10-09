import type { RecoveryResult, SleepSummary, StrainResult, Trend } from '../../domain/recovery';

export interface VitalsSnapshot {
  /** Apps and devices the numbers came from, e.g. ["WHOOP", "Aryan's Apple Watch"]. */
  sources: string[];
  fromWhoop: boolean;
  recovery?: RecoveryResult;
  strain?: StrainResult;
  sleep?: SleepSummary;
  hrv?: Trend; // ms
  restingHr?: Trend; // bpm
  respiratoryRate?: Trend; // breaths/min
  spo2?: Trend; // %
  wristTempDelta?: number; // °C vs baseline
  readAt: string;
}
