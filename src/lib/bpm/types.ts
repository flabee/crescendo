import type { BpmSource } from "../store/types";

export interface TrackRef {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
}

export interface BpmLookupResult {
  bpm: number;
  source: BpmSource;
  matchedTitle: string;
  matchedArtist: string;
  confidence: number;
}
