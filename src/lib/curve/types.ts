export interface CurveTrack {
  id: string;
  bpm: number;
  durationMs: number;
}

export type CurveShape = "ramp" | "ease" | "flat" | "dip";

export interface CurveInput {
  tracks: CurveTrack[];
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
  tolerance?: number; // default 3
  pinnedFirst?: CurveTrack;
  preferScore?: (track: CurveTrack) => number;
  // Shape of the target curve. Defaults to "ramp" (linear) so existing callers
  // keep their exact behaviour.
  shape?: CurveShape;
}

export interface FilledTrack {
  track: CurveTrack;
  target: number;
  deviation: number;
}

export interface FillResult {
  tracks: FilledTrack[];
  achievedMs: number;
  fidelity: {
    maxDeviation: number;
    avgDeviation: number;
    widenedCount: number;
  };
}
