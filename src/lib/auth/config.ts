import NextAuth, { type NextAuthConfig } from "next-auth";
import Spotify from "next-auth/providers/spotify";
import { refreshSpotifyToken } from "@/lib/auth/refresh";

export { refreshSpotifyToken, type RefreshResult } from "@/lib/auth/refresh";

const SCOPES = [
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
].join(" ");

export const authConfig: NextAuthConfig = {
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      // Spotify's provider default `authorization` is a plain string URL, so an
      // override object MUST include `url` — otherwise Auth.js builds `new URL(undefined)`
      // and sign-in throws "Invalid URL" (error=Configuration).
      authorization: { url: "https://accounts.spotify.com/authorize", params: { scope: SCOPES } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_at ?? 0) * 1000;
        return token;
      }
      if (Date.now() < ((token.expiresAt as number) ?? 0) - 60_000) return token;
      const refreshed = await refreshSpotifyToken(
        token.refreshToken as string,
        process.env.SPOTIFY_CLIENT_ID!,
        process.env.SPOTIFY_CLIENT_SECRET!,
      );
      if (refreshed.error) return { ...token, error: refreshed.error };
      return { ...token, accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt };
    },
    async session({ session, token }) {
      (session as unknown as { accessToken?: string }).accessToken = token.accessToken as string;
      (session as unknown as { error?: string }).error = token.error as string | undefined;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
