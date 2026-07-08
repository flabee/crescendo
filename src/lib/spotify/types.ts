export interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  isrc?: string;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
}

export interface ArtistRef {
  id: string;
  name: string;
}
