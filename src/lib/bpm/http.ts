/**
 * Fetch a URL and parse JSON, returning null on a non-OK HTTP response.
 *
 * `inspect` runs against the parsed body before it is returned, giving callers
 * a hook to detect API-specific error envelopes (e.g. Deezer returns HTTP 200
 * with an `{ error: {...} }` body) and throw so the caller can treat it as a
 * failure rather than a clean miss.
 */
export async function fetchJson<T>(
  url: string,
  inspect?: (json: unknown) => void,
): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as unknown;
  inspect?.(json);
  return json as T;
}
