import { fetchJson } from "@/lib/bpm/http";

const BASE = "https://api.deezer.com";

/**
 * Deezer signals quota/errors as HTTP 200 with an `{ error: {...} }` body.
 * Throw on that so the caller's try/catch treats it as a failure (logged empty
 * result) rather than a silent clean miss.
 */
function throwOnDeezerError(json: unknown): void {
  if (json && typeof json === "object" && "error" in json) {
    throw new Error("deezer error");
  }
}

export async function deezerResolveArtistId(name: string): Promise<number | null> {
  try {
    const r = await fetchJson<{ data?: Array<{ id: number; name: string }> }>(
      `${BASE}/search/artist?q=${encodeURIComponent(name)}`,
      throwOnDeezerError,
    );
    return r?.data?.[0]?.id ?? null;
  } catch (err) {
    console.warn(`deezerResolveArtistId failed for "${name}":`, err);
    return null;
  }
}

export async function deezerRelatedNames(artistId: number): Promise<string[]> {
  try {
    const r = await fetchJson<{ data?: Array<{ id: number; name: string }> }>(
      `${BASE}/artist/${artistId}/related`,
      throwOnDeezerError,
    );
    return (r?.data ?? []).map((a) => a.name).filter(Boolean);
  } catch (err) {
    console.warn(`deezerRelatedNames failed for id ${artistId}:`, err);
    return [];
  }
}
