import type { ArtistRef } from "../spotify/types";

/** Lowercased set of artist names the user is familiar with (their top artists). */
export function familiaritySet(topArtists: ArtistRef[]): Set<string> {
  return new Set(topArtists.map((a) => a.name.toLowerCase()));
}
