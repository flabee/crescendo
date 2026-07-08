"use client";

export interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  isrc?: string;
}

export interface GenerateResult {
  tracks: { id: string; title: string; artist: string; bpm: number; target: number; deviation: number }[];
  achievedMinutes: number;
  poolSize: number;
  matchedSize: number;
  filteredSize: number;
  fidelity: { maxDeviation: number; avgDeviation: number; widenedCount: number };
  suggestWiden: boolean;
  seedOutOfRange: boolean;
}

export function SeedStudio() {
  return <div className="text-neutral-400">Seed studio coming soon…</div>;
}
