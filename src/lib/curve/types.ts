export interface CurveTrack {
  id: string;
  bpm: number;
  durationMs: number;
}

export interface CurveInput {
  tracks: CurveTrack[];
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
  tolerance?: number; // default 3
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
