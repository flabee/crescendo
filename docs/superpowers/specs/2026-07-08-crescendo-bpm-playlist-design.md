# Crescendo — BPM-Curve Playlist Generator: Design

**Date:** 2026-07-08
**Status:** Approved design, ready for implementation planning

## Summary

Crescendo generates Spotify playlists that follow a controllable BPM curve. The
user picks a candidate pool of tracks, sets a tempo ramp (start BPM, end BPM,
duration), and the app fills the ramp with real tracks whose tempo tracks the
curve over time. The finished playlist is saved as a private playlist on the
user's Spotify account; playback happens in the Spotify app — Crescendo never
streams audio itself.

Because Spotify no longer exposes tempo data to new API apps, BPM is enriched
from Deezer (primary) and GetSongBPM (fallback), matched by ISRC then
title+artist, and cached.

## Distribution Model (drives the architecture)

Crescendo is an **open-source, self-hosted, single-user app**. It is NOT a
hosted multi-user product — Spotify's API makes that impossible (dev mode caps
at 5 allowlisted users as of Feb 2026; extended quota requires a registered
business with 250k+ MAU).

Each user forks/deploys their own instance with their own Spotify client ID
(dev mode, personal use — compliant with Spotify's Developer Terms) and their
own Premium account.

Consequences:
- **Single-user by design.** No multi-tenancy, no user accounts, no auth beyond
  Spotify OAuth for the one owner. No allowlist code — Spotify dev mode already
  restricts login to accounts the owner added in their dashboard.
- **Zero-friction setup is a feature.** "Deploy to Vercel" button, env vars for
  `SPOTIFY_CLIENT_ID` / redirect URI, README with step-by-step Spotify-dashboard
  screenshots. Target: under 10 minutes from fork to running.
- **No Supabase / no required database.** BPM cache and history use a pluggable
  store that works with zero add-ons and can be upgraded to persistent KV.
- **MIT license**, personal-use disclaimer in the README.
- **GetSongBPM attribution:** their terms require a visible backlink to their
  site — placed in the app footer.

## Scope

**In scope (MVP):**
- Spotify OAuth login (single owner).
- Candidate pool from four sources: liked songs, top tracks, selected
  playlists, catalog genre search.
- Merge + dedupe candidates into one pool.
- BPM enrichment: cache → Deezer (ISRC, then title+artist search) → GetSongBPM.
- Linear BPM ramp sized by **duration (minutes)**.
- Greedy time-proportional fill with tolerance widening.
- Save as a private Spotify playlist.
- Generation history when persistent KV is configured.

**Deferred (post-MVP), consistent with the concept:**
- Draggable curve editor.
- Easing shapes (ease-in / ease-out / flat) — MVP is linear only.
- Camelot / musical-key matching.
- Per-track manual BPM override (widening + fidelity report covers thin data).

## Architecture

**Stack:** Next.js 15 (App Router) + Tailwind 4, deployed on Vercel. Auth.js
(NextAuth v5) with the Spotify provider for OAuth + token refresh. Pluggable
storage (`lib/store`) for BPM cache and history.

**Selected approach — server-centric with client-orchestrated enrichment:**
All Spotify / Deezer / GetSongBPM / store access runs in Next.js server routes;
the browser is thin UI holding no secrets. Enrichment of a large pool would
exceed Vercel's function timeout, so the client drives it in ~50-track chunks
(`POST /enrich`), which both stays under the timeout and yields a natural
progress bar. Cache-first means most lookups are instant after the first run.

(Rejected: client-heavy — Deezer blocks browser CORS and secrets would leak;
background-job/queue — more infrastructure than a single-user app warrants.)

**Auth model:** Auth.js runs the Spotify Authorization Code flow, stores
access/refresh tokens in an encrypted JWT session cookie, and refreshes
automatically. Scopes: `user-library-read`, `user-top-read`,
`playlist-read-private`, `playlist-modify-private`. First successful login may
pin the owner's Spotify user ID to lock the instance. No separate allowlist.

### Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `lib/auth` | Auth.js config, token refresh | Spotify OAuth |
| `lib/spotify` | Typed Web API client: liked / top / playlists / search / create / add. Pagination + 429 `Retry-After` handling | session token |
| `lib/pool` | Merge + dedupe candidates from selected sources into one list | `spotify` |
| `lib/bpm` | Enrichment: cache lookup, Deezer (ISRC then search), GetSongBPM; confidence scoring; batch orchestration | `store`, Deezer, GetSongBPM |
| `lib/curve` | **Pure** functions: BPM targets + greedy fill. No I/O | none |
| `lib/store` | Pluggable persistence: memory+seed (default) or KV (optional). Cache + history | Vercel KV / Upstash (optional) |
| `app/*` routes | `/enrich` (chunked), `/generate`, `/save`; server actions | all above |
| UI components | Source picker, curve controls, progress, results, save | routes |

Isolation win: `lib/curve` is pure and deterministic — it is the crown jewel
and gets the heaviest tests with zero network mocking.

### Storage (pluggable, graceful degradation)

- **Always on:** seed `bpm-cache.json` (popular tracks) loaded at boot + an
  in-memory layer for the session. Deploy works with zero add-ons; misses just
  re-fetch from external APIs each session.
- **Optional:** if `KV_*` / Upstash env vars are present, a KV adapter provides
  a persistent BPM cache and generation history. Same `lib/store` interface
  either way; the app auto-detects.
- **History** persists only when KV is configured; without it, history is
  session-only. Stated clearly in UI + README.

## Data Flow (pipeline)

1. **Login & lock.** Spotify OAuth via Auth.js → session cookie (tokens +
   Spotify user ID). Spotify dev mode restricts login to the owner.
2. **Build pool.** User selects sources (liked / top / playlists / genre
   search). Playlists: list the owner's playlists for a picker; genre search: a
   query box. Server fetches all selected sources (paginated), normalizes each
   track to `{ id, title, artist, durationMs, isrc }`, then merges and dedupes —
   primary key Spotify `id`, secondary dedupe by ISRC. Result: one candidate
   list.
3. **Enrich with BPM (chunked).** Client sends candidate IDs to `/enrich` in
   ~50-track chunks. Per track: (a) hit `bpm_cache` by track ID → instant; (b)
   miss → Deezer by ISRC → Deezer title+artist search → GetSongBPM; (c) write
   result to store. Each chunk returns progress; UI shows a bar and "X of Y
   matched". Unmatched tracks are flagged, not dropped.
4. **Fill the curve.** User sets start BPM, end BPM, duration (minutes); shape
   is linear. `lib/curve` takes only matched tracks + params and runs the
   time-proportional greedy fill. Returns ordered tracks + fidelity summary.
5. **Review & save.** Results view lists ordered tracks with BPM, source,
   confidence, and the fidelity note. On Save, server creates a private playlist
   and adds tracks in order, then writes a `generations` record (if KV present).
   Save failures surface an error but keep results on screen for retry.

Cache-first means the second generation for a returning owner is near-instant.

## Curve Fill Algorithm (`lib/curve`, pure)

Inputs: `matchedTracks[] {id, bpm, durationMs}`, `startBpm`, `endBpm`,
`targetMinutes`, `tolerance = 3`.

```
targetMs = targetMinutes * 60_000
targetBpmAt(elapsedMs) = startBpm + (endBpm - startBpm) * (elapsedMs / targetMs)

elapsed = 0
result = []
used = set()
while elapsed < targetMs AND unused tracks remain:
    target = targetBpmAt(elapsed)
    tol = tolerance
    pick = nearest unused track with |bpm - target| <= tol
    while pick is null AND tol < MAX_WIDEN:      # widen: 3 -> 5 -> 8 -> 12 -> 20
        tol = nextWiden(tol)
        pick = nearest unused track within tol
    if pick is null:                              # nothing left at any width
        pick = globally nearest unused track      # uncapped nearest backstop
    result.push({ track: pick, target, deviation: |pick.bpm - target| })
    used.add(pick); elapsed += pick.durationMs
return { tracks: result, achievedMs: elapsed,
         fidelity: { maxDeviation, avgDeviation, widenedCount } }
```

Properties:
- **Time-proportional targets** — a long track advances the curve more than a
  short one, so BPM tracks real elapsed time, not slot index.
- **Deterministic** — no randomness; ties broken by lowest track ID. Fully
  unit-testable with plain arrays, no mocks.
- **Always terminates** near `targetMinutes`. Stops on the first track that
  crosses the target duration (overshoot preferred over undershoot, so the
  playlist is never short).
- Widening steps: `3 → 5 → 8 → 12 → 20`, then uncapped nearest.
- **Fidelity report** feeds the "we stretched the curve here" UI note.

## Data Shapes

Behind the `lib/store` interface (KV keys or in-memory maps):

**`bpm_cache`** — keyed by Spotify track ID:
```
{ trackId, bpm, source: "deezer-isrc"|"deezer-search"|"getsongbpm",
  matchedTitle, matchedArtist, confidence: 0..1, fetchedAt }
```
Seed `bpm-cache.json` ships this same shape. Read-through: seed → session memory
→ KV (if present). `confidence` = 1.0 for ISRC matches; lower for fuzzy
title+artist (scored on string similarity).

**`generations`** (only when KV present) — keyed by timestamp/id:
```
{ id, createdAt, params: { startBpm, endBpm, targetMinutes, sources },
  trackIds: [...], playlistId,
  fidelity: { maxDeviation, avgDeviation, widenedCount } }
```

## Error Handling

- **Spotify 401** → Auth.js refresh; hard failure → re-login prompt.
- **Spotify 429** → respect `Retry-After`, backoff, resume the chunk.
- **Deezer / GetSongBPM** miss/error/timeout → mark track unmatched, never
  block; unmatched tracks excluded from the fill but shown in a "no BPM found"
  list.
- **Thin pool** → if matched tracks can't cover the duration, fill what exists
  and report "playlist is N minutes, wanted M."
- **Empty pool / no sources selected** → validation before generate.
- **Save failure** → error toast; results stay on screen for retry.
- **No KV configured** → history silently disabled (not an error); cache still
  works in-memory + seed.

## Testing

- **`lib/curve`** (heavy): ramp up, ramp down, flat, thin pool forcing
  widening, overshoot-stop behavior, deterministic tie-breaking, single-track
  and empty inputs. Pure, no mocks.
- **`lib/bpm` matcher**: fixtures for Deezer ISRC hit, ISRC miss → search
  fallback, GetSongBPM fallback, confidence scoring, cache-hit short-circuit.
- **`lib/pool`**: dedupe by ID and by ISRC across sources.
- **`lib/spotify`**: mocked HTTP — pagination, 429 handling.
- **Store adapters**: memory and KV satisfy the same interface (contract test).
- **Manual**: one real end-to-end pass documented in README verify steps
  (deploy → login → generate → save).

## Known Risks

- **BPM matching accuracy.** ISRC-first raises reliability above the ~90% the
  concept assumed for title+artist alone; confidence is stored and surfaced.
  Fuzzy fallback matches can still be wrong — shown with lower confidence.
- **Deezer public API** has no official SLA / documented rate limit; enrichment
  is rate-limit-friendly (chunked, cache-first, never re-fetch a cached track).
- **Vercel function timeout** is mitigated by client-orchestrated chunking.
- **Spotify deprecations:** `recommendations` and `audio-features` endpoints are
  not used (deprecated for new apps). Pool building relies on library / top /
  playlists / search only. `duration_ms` and `external_ids.isrc` on track
  objects remain available and are used.
