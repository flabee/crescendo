import { fetchJson } from "@/lib/bpm/http";

const BASE = "https://api.deezer.com";

export async function deezerResolveArtistId(name: string): Promise<number | null> {
  const r = await fetchJson<{ data?: Array<{ id: number; name: string }> }>(
    `${BASE}/search/artist?q=${encodeURIComponent(name)}`,
  );
  return r?.data?.[0]?.id ?? null;
}

export async function deezerRelatedNames(artistId: number): Promise<string[]> {
  const r = await fetchJson<{ data?: Array<{ id: number; name: string }> }>(
    `${BASE}/artist/${artistId}/related`,
  );
  return (r?.data ?? []).map((a) => a.name).filter(Boolean);
}
