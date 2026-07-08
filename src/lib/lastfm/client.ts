const BASE = "https://ws.audioscrobbler.com/2.0/";

export async function lastfmSimilar(artistName: string, limit = 20): Promise<string[]> {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return [];
  const url = `${BASE}?method=artist.getsimilar&artist=${encodeURIComponent(artistName)}&api_key=${key}&format=json&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { similarartists?: { artist?: Array<{ name?: string }> } };
    return (json.similarartists?.artist ?? []).map((a) => a.name).filter((n): n is string => !!n);
  } catch {
    return [];
  }
}
