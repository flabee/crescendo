export interface RefreshResult {
  accessToken?: string;
  expiresAt?: number;
  error?: "RefreshFailed";
}

export async function refreshSpotifyToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  now: () => number = () => Date.now(),
): Promise<RefreshResult> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) return { error: "RefreshFailed" };
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: data.access_token, expiresAt: now() + data.expires_in * 1000 };
}
