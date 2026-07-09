# Crescendo

Crescendo turns a seed track into a Spotify playlist that follows a tempo (BPM) curve — like Radio, but with direction. You pick where the energy starts, where it ends, and how long it runs; Crescendo builds the ramp for you.

It is **open-source, self-hosted, and single-user**: each person deploys their own instance with their own Spotify developer app and Premium account. This is a requirement, not a limitation — Spotify's Web API "development mode" caps each app to a handful of manually allowlisted users, so a shared public instance isn't possible. Running your own instance keeps you inside those terms.

## How it works

1. **Log in with Spotify** (OAuth via your own developer app).
2. **Search & pick a seed track.** The seed's BPM sets the starting point of the curve.
3. **Set the curve** — start BPM, end BPM, and total minutes.
4. **Crescendo builds a candidate pool** from the seed artist plus similar artists (via Deezer's keyless related-artists endpoint, optionally widened by Last.fm), then **enriches BPM** for those tracks (Deezer, with GetSongBPM as an optional fallback).
5. **The curve is filled** so tempo moves smoothly from start to end. The seed is pinned as track #1, and artists you already listen to are preferred when choosing between candidates.
6. **Save as a private Spotify playlist.**

Playback happens in Spotify — Crescendo never streams audio, it only assembles and saves the playlist.

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<owner>/crescendo&env=SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET,AUTH_SECRET,NEXTAUTH_URL)

> Replace `<owner>` in the button URL above with your fork's GitHub owner (user or org) before using it.

After deploying, set `NEXTAUTH_URL` to your Vercel URL (e.g. `https://<your-app>.vercel.app`) and add the matching redirect URI in the Spotify dashboard (see below).

## Spotify dashboard setup

> The screenshots below are placeholders — replace the images in `docs/img/` with real captures if you want visual guidance.

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and **create an app**.

   ![Create an app](docs/img/create-app.png)

2. Open the app's **Settings** and copy the **Client ID** and **Client Secret** into `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.

   ![Copy client credentials](docs/img/client-credentials.png)

3. Add the **Redirect URIs**. You need one per environment you use:
   - Local: `http://127.0.0.1:3000/api/auth/callback/spotify` — **use the loopback IP `127.0.0.1`, not `localhost`**; Spotify rejects `localhost` as insecure. Browse the app at `http://127.0.0.1:3000` so the callback host matches.
   - Production: `https://<your-app>.vercel.app/api/auth/callback/spotify`

   ![Add redirect URIs](docs/img/redirect-uris.png)

4. Under **Users and Access**, add your own Spotify account. Spotify apps in development mode only work for explicitly allowlisted users — this is exactly why Crescendo is single-user and self-hosted.

   ![Users and Access](docs/img/users-and-access.png)

## Environment variables

Mirror these into `.env.local` (local) or your Vercel project settings (production). See `.env.example`.

| Variable | Required | Description |
| --- | --- | --- |
| `SPOTIFY_CLIENT_ID` | Required | Client ID from your Spotify developer app. |
| `SPOTIFY_CLIENT_SECRET` | Required | Client Secret from your Spotify developer app. |
| `AUTH_SECRET` | Required | Session encryption secret. Generate with `openssl rand -base64 32`. |
| `NEXTAUTH_URL` / `AUTH_URL` | Required | Base URL of your instance. `http://127.0.0.1:3000` locally (not `localhost` — see redirect URI note above), `https://<your-app>.vercel.app` in production. Must match a configured redirect URI. Set `AUTH_TRUST_HOST=true` for local/self-hosted. |
| `GETSONGBPM_API_KEY` | Optional | Adds a BPM fallback source ([getsongbpm.com/api](https://getsongbpm.com/api)). Their terms require an attribution backlink, which is already in the app footer. |
| `LASTFM_API_KEY` | Optional | Widens the similar-artist graph ([last.fm/api](https://www.last.fm/api)). Without it, Deezer related-artists still works with zero config. |
| `KV_REST_API_URL` | Optional | Vercel KV / Upstash REST URL. With `KV_REST_API_TOKEN`, enables a persistent BPM cache + generation history. |
| `KV_REST_API_TOKEN` | Optional | Vercel KV / Upstash REST token. Pairs with `KV_REST_API_URL`. Without both, the app runs in-memory and re-fetches uncached BPM each session. |

## Local development

```bash
cp .env.example .env.local   # then fill in the required values
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) (use `127.0.0.1`, not `localhost`, to match the Spotify redirect URI).

## Warm start (optional) — seed the BPM cache

The repo ships `data/bpm-cache.json`, currently an empty array (`[]`). The app works fine cold — it just fetches BPM on demand, so the first few generations are slower. Contributors can pre-populate this file with popular tracks so fresh instances start warm.

Each entry is one object per Spotify track id:

```json
[
  {
    "trackId": "<spotifyId>",
    "bpm": 128,
    "source": "deezer-isrc",
    "matchedTitle": "…",
    "matchedArtist": "…",
    "confidence": 1,
    "fetchedAt": "<ISO>"
  }
]
```

## License & disclaimer

MIT — see [`LICENSE`](LICENSE).

Personal-use disclaimer: each user runs their own Spotify developer-mode app under [Spotify's Developer Terms](https://developer.spotify.com/terms). Crescendo is an independent project and is **not affiliated with, endorsed by, or sponsored by** Spotify, Deezer, GetSongBPM, or Last.fm.
