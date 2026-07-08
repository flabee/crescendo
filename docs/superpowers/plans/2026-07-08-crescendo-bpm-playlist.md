# Crescendo — BPM-Curve Playlist Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, single-user Next.js app that generates a Spotify playlist following a linear BPM ramp over a target duration, enriching tempo data from Deezer/GetSongBPM.

**Architecture:** Next.js 15 App Router on Vercel. Server-centric: all Spotify/Deezer/GetSongBPM/store access runs in server routes; the browser is thin UI holding no secrets. BPM enrichment is client-orchestrated in chunks to stay under the serverless timeout and drive a progress bar. Storage is a pluggable interface — seed-JSON + in-memory by default, optional Vercel KV for persistence. The curve fill (`lib/curve`) is pure and deterministic.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 4, Auth.js (NextAuth v5) w/ Spotify provider, Vitest, `@vercel/kv` (optional), `zod` for input validation.

**Reference spec:** `docs/superpowers/specs/2026-07-08-crescendo-bpm-playlist-design.md`

**Conventions used throughout:**
- Package manager: `npm`. Test runner: `vitest`. Run a single test file with `npx vitest run <path>`.
- All modules are TypeScript ESM under `src/`. Path alias `@/` → `src/`.
- TDD: write the failing test, run it red, implement minimally, run it green, commit.
- Commit messages use Conventional Commits (`feat:`, `test:`, `chore:`).

---

## File Structure

```
src/
  lib/
    curve/
      types.ts          # CurveInput, FilledTrack, FillResult
      fill.ts           # pure greedy fill + targetBpmAt
    store/
      types.ts          # Store interface, BpmCacheEntry, GenerationRecord
      seed.ts           # loads bpm-cache.json
      memory-store.ts   # default: seed + in-memory
      kv-store.ts       # optional Vercel KV adapter
      index.ts          # getStore(): picks adapter from env
    bpm/
      types.ts          # BpmLookupResult, TrackRef
      match.ts          # title/artist normalization + confidence scoring
      deezer.ts         # Deezer client (isrc + search)
      getsongbpm.ts     # GetSongBPM client
      enrich.ts         # orchestrator: cache -> deezer -> getsongbpm
    spotify/
      types.ts          # SpotifyTrack, Paged<T>
      client.ts         # typed Web API client w/ pagination + 429 handling
    pool/
      dedupe.ts         # merge + dedupe candidates
    auth/
      config.ts         # Auth.js config (Spotify provider + refresh)
  app/
    api/
      enrich/route.ts   # POST: enrich a chunk of track ids
      generate/route.ts # POST: build pool + fill curve
      save/route.ts     # POST: create playlist + add tracks
    page.tsx            # main UI
    layout.tsx
  components/
    SourcePicker.tsx
    CurveControls.tsx
    EnrichProgress.tsx
    ResultsView.tsx
data/
  bpm-cache.json        # seed cache (starts as [])
tests/                  # mirrors src/ with *.test.ts
```

---

## Phase 0: Project scaffold

### Task 0.1: Initialize Next.js + TypeScript + Tailwind + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`, `LICENSE`

- [ ] **Step 1: Scaffold the app non-interactively**

Run:
```bash
npx create-next-app@latest . --ts --tailwind --app --src-dir --import-alias "@/*" --no-eslint --use-npm --yes
```
Expected: project files created in the current directory. If it refuses because the dir is non-empty, move `README.md` and `docs/` aside, scaffold, then restore them.

- [ ] **Step 2: Add dev/runtime dependencies**

Run:
```bash
npm install next-auth@beta zod
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
npm install @vercel/kv
```
Expected: installs succeed; `@vercel/kv` is imported lazily so it's fine that KV is unconfigured.

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
```

- [ ] **Step 4: Add test script to `package.json`**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Add MIT LICENSE and a smoke test**

Create `LICENSE` with the standard MIT text (year 2026, copyright holder "Crescendo contributors").

Create `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the smoke test**

Run: `npx vitest run tests/smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + Tailwind 4 + Vitest, add MIT license"
```

---

## Phase 1: `lib/curve` — pure fill algorithm (crown jewel)

### Task 1.1: Curve types and `targetBpmAt`

**Files:**
- Create: `src/lib/curve/types.ts`, `src/lib/curve/fill.ts`
- Test: `tests/lib/curve/fill.test.ts`

- [ ] **Step 1: Write the failing test for `targetBpmAt`**

Create `tests/lib/curve/fill.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { targetBpmAt } from "@/lib/curve/fill";

describe("targetBpmAt", () => {
  const targetMs = 60_000; // 1 minute
  it("returns startBpm at elapsed 0", () => {
    expect(targetBpmAt(0, 100, 128, targetMs)).toBe(100);
  });
  it("returns endBpm at elapsed == targetMs", () => {
    expect(targetBpmAt(targetMs, 100, 128, targetMs)).toBe(128);
  });
  it("interpolates linearly at the midpoint", () => {
    expect(targetBpmAt(30_000, 100, 128, targetMs)).toBe(114);
  });
  it("supports descending ramps (wind-down)", () => {
    expect(targetBpmAt(30_000, 128, 100, targetMs)).toBe(114);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/curve/fill.test.ts`
Expected: FAIL — `targetBpmAt` is not exported / module missing.

- [ ] **Step 3: Create `src/lib/curve/types.ts`**

```typescript
export interface CurveTrack {
  id: string;
  bpm: number;
  durationMs: number;
}

export interface CurveInput {
  tracks: CurveTrack[];
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
  tolerance?: number; // default 3
}

export interface FilledTrack {
  track: CurveTrack;
  target: number;
  deviation: number;
}

export interface FillResult {
  tracks: FilledTrack[];
  achievedMs: number;
  fidelity: {
    maxDeviation: number;
    avgDeviation: number;
    widenedCount: number;
  };
}
```

- [ ] **Step 4: Implement `targetBpmAt` in `src/lib/curve/fill.ts`**

```typescript
import type { CurveInput, CurveTrack, FillResult, FilledTrack } from "./types";

export function targetBpmAt(
  elapsedMs: number,
  startBpm: number,
  endBpm: number,
  targetMs: number,
): number {
  if (targetMs <= 0) return startBpm;
  const frac = Math.min(elapsedMs / targetMs, 1);
  return startBpm + (endBpm - startBpm) * frac;
}
```

- [ ] **Step 5: Run it green**

Run: `npx vitest run tests/lib/curve/fill.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/curve tests/lib/curve
git commit -m "feat(curve): add types and targetBpmAt interpolation"
```

### Task 1.2: The greedy fill with widening

**Files:**
- Modify: `src/lib/curve/fill.ts`
- Test: `tests/lib/curve/fill.test.ts`

- [ ] **Step 1: Add failing tests for `fillCurve`**

Append to `tests/lib/curve/fill.test.ts`:
```typescript
import { fillCurve } from "@/lib/curve/fill";

const t = (id: string, bpm: number, min: number): { id: string; bpm: number; durationMs: number } =>
  ({ id, bpm, durationMs: min * 60_000 });

describe("fillCurve", () => {
  it("picks tracks tracking the ramp and stops once the target duration is reached", () => {
    const tracks = [t("a", 100, 1), t("b", 114, 1), t("c", 128, 1), t("d", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 128, targetMinutes: 2 });
    // targets: 0min -> 100 picks a; after 1min -> 114 picks b; elapsed now == 2min, loop stops.
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "b"]);
    expect(res.achievedMs).toBe(2 * 60_000);
  });

  it("overshoots rather than undershoots when durations do not divide evenly", () => {
    // 1.5-min tracks, 2-min target: after a (1.5min) elapsed < target, so b is added, crossing to 3min.
    const tracks = [t("a", 100, 1.5), t("b", 100, 1.5)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2 });
    expect(res.tracks).toHaveLength(2);
    expect(res.achievedMs).toBe(3 * 60_000);
  });

  it("is deterministic: ties break by lowest id", () => {
    const tracks = [t("z", 100, 1), t("a", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 1 });
    expect(res.tracks[0].track.id).toBe("a");
  });

  it("widens tolerance when nothing is within +/-3 and records widenedCount", () => {
    const tracks = [t("a", 100, 1), t("far", 140, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2, tolerance: 3 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "far"]);
    expect(res.fidelity.widenedCount).toBe(1); // "far" required widening past 3
  });

  it("uses uncapped nearest when even MAX_WIDEN misses", () => {
    const tracks = [t("a", 100, 1), t("way", 400, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 2 });
    expect(res.tracks.map((x) => x.track.id)).toEqual(["a", "way"]);
  });

  it("stops when tracks run out even if under target", () => {
    const tracks = [t("a", 100, 1)];
    const res = fillCurve({ tracks, startBpm: 100, endBpm: 100, targetMinutes: 10 });
    expect(res.tracks).toHaveLength(1);
    expect(res.achievedMs).toBe(60_000);
  });

  it("returns empty result for empty pool", () => {
    const res = fillCurve({ tracks: [], startBpm: 100, endBpm: 128, targetMinutes: 5 });
    expect(res.tracks).toEqual([]);
    expect(res.achievedMs).toBe(0);
    expect(res.fidelity.maxDeviation).toBe(0);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/curve/fill.test.ts`
Expected: FAIL — `fillCurve` not exported.

- [ ] **Step 3: Implement `fillCurve`**

Append to `src/lib/curve/fill.ts`:
```typescript
const WIDEN_STEPS = [3, 5, 8, 12, 20];

function nextWiden(tol: number): number | null {
  const idx = WIDEN_STEPS.indexOf(tol);
  if (idx === -1) {
    // tol not a known step: jump to the first step strictly greater than it
    const next = WIDEN_STEPS.find((s) => s > tol);
    return next ?? null;
  }
  return idx + 1 < WIDEN_STEPS.length ? WIDEN_STEPS[idx + 1] : null;
}

function nearestWithin(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
  tol: number,
): CurveTrack | null {
  let best: CurveTrack | null = null;
  let bestDev = Infinity;
  for (const tr of tracks) {
    if (used.has(tr.id)) continue;
    const dev = Math.abs(tr.bpm - target);
    if (dev > tol) continue;
    if (dev < bestDev || (dev === bestDev && best !== null && tr.id < best.id)) {
      best = tr;
      bestDev = dev;
    }
  }
  return best;
}

function globalNearest(
  tracks: CurveTrack[],
  used: Set<string>,
  target: number,
): CurveTrack | null {
  return nearestWithin(tracks, used, target, Infinity);
}

export function fillCurve(input: CurveInput): FillResult {
  const { tracks, startBpm, endBpm, targetMinutes } = input;
  const baseTol = input.tolerance ?? 3;
  const targetMs = targetMinutes * 60_000;

  const used = new Set<string>();
  const result: FilledTrack[] = [];
  let elapsed = 0;
  let widenedCount = 0;

  while (elapsed < targetMs && used.size < tracks.length) {
    const target = targetBpmAt(elapsed, startBpm, endBpm, targetMs);
    let tol = baseTol;
    let pick = nearestWithin(tracks, used, target, tol);
    let widened = false;
    while (pick === null) {
      const next = nextWiden(tol);
      if (next === null) break;
      tol = next;
      widened = true;
      pick = nearestWithin(tracks, used, target, tol);
    }
    if (pick === null) pick = globalNearest(tracks, used, target);
    if (pick === null) break;
    if (widened) widenedCount++;
    result.push({ track: pick, target, deviation: Math.abs(pick.bpm - target) });
    used.add(pick.id);
    elapsed += pick.durationMs;
  }

  const deviations = result.map((r) => r.deviation);
  return {
    tracks: result,
    achievedMs: elapsed,
    fidelity: {
      maxDeviation: deviations.length ? Math.max(...deviations) : 0,
      avgDeviation: deviations.length
        ? deviations.reduce((a, b) => a + b, 0) / deviations.length
        : 0,
      widenedCount,
    },
  };
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/curve/fill.test.ts`
Expected: PASS (all tests). If the first ramp test's expected id order fails, re-derive targets by hand and correct the assertion — the implementation is the source of truth for tie-breaking, the test for behavior.

- [ ] **Step 5: Commit**

```bash
git add src/lib/curve tests/lib/curve
git commit -m "feat(curve): greedy time-proportional fill with tolerance widening"
```

---

## Phase 2: `lib/store` — pluggable persistence

### Task 2.1: Store interface + seed loader + memory store

**Files:**
- Create: `src/lib/store/types.ts`, `src/lib/store/seed.ts`, `src/lib/store/memory-store.ts`, `data/bpm-cache.json`
- Test: `tests/lib/store/memory-store.test.ts`

- [ ] **Step 1: Create the empty seed file**

Create `data/bpm-cache.json`:
```json
[]
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/store/memory-store.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { MemoryStore } from "@/lib/store/memory-store";
import type { BpmCacheEntry } from "@/lib/store/types";

const entry = (trackId: string, bpm: number): BpmCacheEntry => ({
  trackId,
  bpm,
  source: "deezer-isrc",
  matchedTitle: "t",
  matchedArtist: "a",
  confidence: 1,
  fetchedAt: "2026-07-08T00:00:00Z",
});

describe("MemoryStore", () => {
  it("seeds from provided entries and reads them back", async () => {
    const store = new MemoryStore([entry("s1", 120)]);
    expect(await store.getBpm("s1")).toEqual(entry("s1", 120));
  });
  it("returns null for a miss", async () => {
    const store = new MemoryStore([]);
    expect(await store.getBpm("nope")).toBeNull();
  });
  it("writes and reads back a bpm entry", async () => {
    const store = new MemoryStore([]);
    await store.putBpm(entry("s2", 90));
    expect(await store.getBpm("s2")).toEqual(entry("s2", 90));
  });
  it("getManyBpm returns a map of hits only", async () => {
    const store = new MemoryStore([entry("s1", 120)]);
    const map = await store.getManyBpm(["s1", "miss"]);
    expect(map).toEqual({ s1: entry("s1", 120) });
  });
  it("saves and lists generations newest-first", async () => {
    const store = new MemoryStore([]);
    await store.putGeneration({ id: "g1", createdAt: "2026-07-08T00:00:00Z", params: { startBpm: 100, endBpm: 128, targetMinutes: 30, sources: ["liked"] }, trackIds: ["s1"], playlistId: "p1", fidelity: { maxDeviation: 0, avgDeviation: 0, widenedCount: 0 } });
    const list = await store.listGenerations();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("g1");
  });
});
```

- [ ] **Step 3: Run it red**

Run: `npx vitest run tests/lib/store/memory-store.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 4: Create `src/lib/store/types.ts`**

```typescript
export type BpmSource = "deezer-isrc" | "deezer-search" | "getsongbpm";

export interface BpmCacheEntry {
  trackId: string;
  bpm: number;
  source: BpmSource;
  matchedTitle: string;
  matchedArtist: string;
  confidence: number; // 0..1
  fetchedAt: string; // ISO
}

export interface GenerationRecord {
  id: string;
  createdAt: string;
  params: {
    startBpm: number;
    endBpm: number;
    targetMinutes: number;
    sources: string[];
  };
  trackIds: string[];
  playlistId: string;
  fidelity: { maxDeviation: number; avgDeviation: number; widenedCount: number };
}

export interface Store {
  getBpm(trackId: string): Promise<BpmCacheEntry | null>;
  getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>>;
  putBpm(entry: BpmCacheEntry): Promise<void>;
  putGeneration(record: GenerationRecord): Promise<void>;
  listGenerations(): Promise<GenerationRecord[]>;
  /** true when history is durably persisted (KV configured) */
  readonly persistent: boolean;
}
```

- [ ] **Step 5: Create `src/lib/store/memory-store.ts`**

```typescript
import type { BpmCacheEntry, GenerationRecord, Store } from "./types";

export class MemoryStore implements Store {
  readonly persistent = false;
  private bpm = new Map<string, BpmCacheEntry>();
  private generations: GenerationRecord[] = [];

  constructor(seed: BpmCacheEntry[] = []) {
    for (const e of seed) this.bpm.set(e.trackId, e);
  }

  async getBpm(trackId: string): Promise<BpmCacheEntry | null> {
    return this.bpm.get(trackId) ?? null;
  }

  async getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>> {
    const out: Record<string, BpmCacheEntry> = {};
    for (const id of trackIds) {
      const e = this.bpm.get(id);
      if (e) out[id] = e;
    }
    return out;
  }

  async putBpm(entry: BpmCacheEntry): Promise<void> {
    this.bpm.set(entry.trackId, entry);
  }

  async putGeneration(record: GenerationRecord): Promise<void> {
    this.generations.unshift(record);
  }

  async listGenerations(): Promise<GenerationRecord[]> {
    return [...this.generations];
  }
}
```

- [ ] **Step 6: Create `src/lib/store/seed.ts`**

```typescript
import type { BpmCacheEntry } from "./types";
import seedData from "../../../data/bpm-cache.json";

export function loadSeed(): BpmCacheEntry[] {
  return seedData as BpmCacheEntry[];
}
```

Ensure `tsconfig.json` has `"resolveJsonModule": true` (create-next-app enables it; verify).

- [ ] **Step 7: Run it green**

Run: `npx vitest run tests/lib/store/memory-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/store tests/lib/store data/bpm-cache.json
git commit -m "feat(store): Store interface, seed loader, in-memory adapter"
```

### Task 2.2: KV adapter + `getStore()` selector

**Files:**
- Create: `src/lib/store/kv-store.ts`, `src/lib/store/index.ts`
- Test: `tests/lib/store/kv-store.test.ts`

- [ ] **Step 1: Write the failing test using an injected KV client**

Create `tests/lib/store/kv-store.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { KvStore } from "@/lib/store/kv-store";
import type { BpmCacheEntry } from "@/lib/store/types";

// Minimal in-memory fake of the @vercel/kv surface KvStore uses.
function fakeKv() {
  const data = new Map<string, unknown>();
  return {
    data,
    async get<T>(key: string): Promise<T | null> {
      return (data.get(key) as T) ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, value);
    },
    async mget<T>(...keys: string[]): Promise<(T | null)[]> {
      return keys.map((k) => (data.get(k) as T) ?? null);
    },
    async lpush(key: string, value: unknown): Promise<void> {
      const arr = (data.get(key) as unknown[]) ?? [];
      arr.unshift(value);
      data.set(key, arr);
    },
    async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
      const arr = (data.get(key) as T[]) ?? [];
      return stop === -1 ? arr.slice(start) : arr.slice(start, stop + 1);
    },
  };
}

const entry = (trackId: string, bpm: number): BpmCacheEntry => ({
  trackId, bpm, source: "deezer-isrc", matchedTitle: "t", matchedArtist: "a", confidence: 1, fetchedAt: "2026-07-08T00:00:00Z",
});

describe("KvStore", () => {
  it("is persistent", () => {
    expect(new KvStore(fakeKv() as never, []).persistent).toBe(true);
  });
  it("prefers KV value over seed on read", async () => {
    const kv = fakeKv();
    const store = new KvStore(kv as never, [entry("s1", 100)]);
    await store.putBpm(entry("s1", 120));
    expect((await store.getBpm("s1"))?.bpm).toBe(120);
  });
  it("falls back to seed when KV misses", async () => {
    const store = new KvStore(fakeKv() as never, [entry("s1", 100)]);
    expect((await store.getBpm("s1"))?.bpm).toBe(100);
  });
  it("getManyBpm merges KV hits over seed", async () => {
    const kv = fakeKv();
    const store = new KvStore(kv as never, [entry("s1", 100), entry("s2", 90)]);
    await store.putBpm(entry("s2", 95));
    const map = await store.getManyBpm(["s1", "s2", "miss"]);
    expect(map.s1.bpm).toBe(100);
    expect(map.s2.bpm).toBe(95);
    expect(map.miss).toBeUndefined();
  });
  it("persists generations", async () => {
    const store = new KvStore(fakeKv() as never, []);
    await store.putGeneration({ id: "g1", createdAt: "x", params: { startBpm: 1, endBpm: 2, targetMinutes: 3, sources: [] }, trackIds: [], playlistId: "p", fidelity: { maxDeviation: 0, avgDeviation: 0, widenedCount: 0 } });
    expect(await store.listGenerations()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/store/kv-store.test.ts`
Expected: FAIL — `KvStore` missing.

- [ ] **Step 3: Create `src/lib/store/kv-store.ts`**

```typescript
import type { BpmCacheEntry, GenerationRecord, Store } from "./types";

// The subset of the @vercel/kv client we depend on (keeps it testable).
export interface KvClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  mget<T>(...keys: string[]): Promise<(T | null)[]>;
  lpush(key: string, value: unknown): Promise<unknown>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
}

const BPM_KEY = (id: string) => `bpm:${id}`;
const GEN_LIST = "generations";

export class KvStore implements Store {
  readonly persistent = true;
  private seed: Map<string, BpmCacheEntry>;

  constructor(private kv: KvClient, seed: BpmCacheEntry[] = []) {
    this.seed = new Map(seed.map((e) => [e.trackId, e]));
  }

  async getBpm(trackId: string): Promise<BpmCacheEntry | null> {
    const hit = await this.kv.get<BpmCacheEntry>(BPM_KEY(trackId));
    return hit ?? this.seed.get(trackId) ?? null;
  }

  async getManyBpm(trackIds: string[]): Promise<Record<string, BpmCacheEntry>> {
    if (trackIds.length === 0) return {};
    const hits = await this.kv.mget<BpmCacheEntry>(...trackIds.map(BPM_KEY));
    const out: Record<string, BpmCacheEntry> = {};
    trackIds.forEach((id, i) => {
      const e = hits[i] ?? this.seed.get(id);
      if (e) out[id] = e;
    });
    return out;
  }

  async putBpm(entry: BpmCacheEntry): Promise<void> {
    await this.kv.set(BPM_KEY(entry.trackId), entry);
  }

  async putGeneration(record: GenerationRecord): Promise<void> {
    await this.kv.lpush(GEN_LIST, record);
  }

  async listGenerations(): Promise<GenerationRecord[]> {
    return this.kv.lrange<GenerationRecord>(GEN_LIST, 0, -1);
  }
}
```

- [ ] **Step 4: Create `src/lib/store/index.ts`**

```typescript
import { loadSeed } from "./seed";
import { MemoryStore } from "./memory-store";
import { KvStore } from "./kv-store";
import type { Store } from "./types";

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  const seed = loadSeed();
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    cached = new KvStore(kv as never, seed);
  } else {
    cached = new MemoryStore(seed);
  }
  return cached;
}
```

- [ ] **Step 5: Run it green**

Run: `npx vitest run tests/lib/store/kv-store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/store tests/lib/store
git commit -m "feat(store): KV adapter and env-based store selector"
```

---

## Phase 3: `lib/bpm` — matching + external sources + enrichment

### Task 3.1: Normalization + confidence scoring (`match.ts`)

**Files:**
- Create: `src/lib/bpm/types.ts`, `src/lib/bpm/match.ts`
- Test: `tests/lib/bpm/match.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/bpm/match.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { normalize, titleArtistConfidence } from "@/lib/bpm/match";

describe("normalize", () => {
  it("lowercases, strips punctuation and feat/remaster tags", () => {
    expect(normalize("Song (Remastered 2011) - feat. X")).toBe("song");
  });
  it("collapses whitespace", () => {
    expect(normalize("  A   B  ")).toBe("a b");
  });
});

describe("titleArtistConfidence", () => {
  it("scores exact normalized match as 1", () => {
    expect(titleArtistConfidence("Hey Jude", "The Beatles", "hey jude", "the beatles")).toBe(1);
  });
  it("scores a clear mismatch below 0.5", () => {
    expect(titleArtistConfidence("Hey Jude", "The Beatles", "Toxic", "Britney Spears")).toBeLessThan(0.5);
  });
  it("tolerates minor differences above 0.8", () => {
    expect(titleArtistConfidence("Hey Jude", "Beatles", "Hey Jude", "The Beatles")).toBeGreaterThan(0.8);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/bpm/match.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/bpm/types.ts`**

```typescript
import type { BpmSource } from "../store/types";

export interface TrackRef {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
}

export interface BpmLookupResult {
  bpm: number;
  source: BpmSource;
  matchedTitle: string;
  matchedArtist: string;
  confidence: number;
}
```

- [ ] **Step 4: Create `src/lib/bpm/match.ts`**

```typescript
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((remastered|remaster|feat\.?|featuring)[^)]*\)/g, "")
    .replace(/-\s*(remastered|remaster|feat\.?|featuring).*/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Dice coefficient on character bigrams: 0..1, order-insensitive, cheap.
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, countA] of A) {
    const countB = B.get(g) ?? 0;
    overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export function titleArtistConfidence(
  wantTitle: string,
  wantArtist: string,
  gotTitle: string,
  gotArtist: string,
): number {
  const titleScore = dice(normalize(wantTitle), normalize(gotTitle));
  const artistScore = dice(normalize(wantArtist), normalize(gotArtist));
  // Title matters more than artist string exactness.
  return Number((titleScore * 0.6 + artistScore * 0.4).toFixed(3));
}
```

- [ ] **Step 5: Run it green**

Run: `npx vitest run tests/lib/bpm/match.test.ts`
Expected: PASS. If the "minor differences > 0.8" case fails, the weighting is fine but the assertion is strict — verify by logging the score and adjust the threshold in the test to match observed good-match behavior (should be ~0.85).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bpm tests/lib/bpm
git commit -m "feat(bpm): title/artist normalization and confidence scoring"
```

### Task 3.2: Deezer client

**Files:**
- Create: `src/lib/bpm/deezer.ts`
- Test: `tests/lib/bpm/deezer.test.ts`

- [ ] **Step 1: Write the failing test with a mocked `fetch`**

Create `tests/lib/bpm/deezer.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupDeezer } from "@/lib/bpm/deezer";

function mockFetch(handler: (url: string) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => handler(String(url)),
  })));
}

afterEach(() => vi.unstubAllGlobals());

describe("lookupDeezer", () => {
  it("uses ISRC endpoint first and returns bpm with confidence 1", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { bpm: 123, title: "Song", artist: { name: "Artist" } };
      throw new Error("should not reach search");
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" });
    expect(res).toMatchObject({ bpm: 123, source: "deezer-isrc", confidence: 1 });
  });

  it("ignores ISRC hit with bpm 0 and falls through to search", async () => {
    mockFetch((url) => {
      if (url.includes("/track/isrc:USRC")) return { bpm: 0, title: "Song", artist: { name: "Artist" } };
      if (url.includes("/search/track")) return { data: [{ bpm: 128, title: "Song", artist: { name: "Artist" } }] };
      return {};
    });
    const res = await lookupDeezer({ id: "s1", title: "Song", artist: "Artist", isrc: "USRC" });
    expect(res).toMatchObject({ bpm: 128, source: "deezer-search" });
  });

  it("returns null when nothing has a usable bpm", async () => {
    mockFetch(() => ({ data: [] }));
    const res = await lookupDeezer({ id: "s1", title: "X", artist: "Y" });
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/bpm/deezer.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/bpm/deezer.ts`**

```typescript
import type { BpmLookupResult, TrackRef } from "./types";
import { titleArtistConfidence } from "./match";

const BASE = "https://api.deezer.com";

interface DeezerTrack {
  bpm?: number;
  title?: string;
  artist?: { name?: string };
}

async function getJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function lookupDeezer(ref: TrackRef): Promise<BpmLookupResult | null> {
  // 1. ISRC (most reliable)
  if (ref.isrc) {
    const t = await getJson<DeezerTrack>(`${BASE}/track/isrc:${encodeURIComponent(ref.isrc)}`);
    if (t && typeof t.bpm === "number" && t.bpm > 0) {
      return {
        bpm: t.bpm,
        source: "deezer-isrc",
        matchedTitle: t.title ?? ref.title,
        matchedArtist: t.artist?.name ?? ref.artist,
        confidence: 1,
      };
    }
  }
  // 2. title + artist search
  const q = encodeURIComponent(`track:"${ref.title}" artist:"${ref.artist}"`);
  const search = await getJson<{ data?: DeezerTrack[] }>(`${BASE}/search/track?q=${q}`);
  const hit = search?.data?.find((d) => typeof d.bpm === "number" && d.bpm > 0);
  if (hit && typeof hit.bpm === "number") {
    return {
      bpm: hit.bpm,
      source: "deezer-search",
      matchedTitle: hit.title ?? ref.title,
      matchedArtist: hit.artist?.name ?? ref.artist,
      confidence: titleArtistConfidence(ref.title, ref.artist, hit.title ?? "", hit.artist?.name ?? ""),
    };
  }
  return null;
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/bpm/deezer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bpm/deezer.ts tests/lib/bpm/deezer.test.ts
git commit -m "feat(bpm): Deezer client (ISRC then title/artist search)"
```

### Task 3.3: GetSongBPM client

**Files:**
- Create: `src/lib/bpm/getsongbpm.ts`
- Test: `tests/lib/bpm/getsongbpm.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/bpm/getsongbpm.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupGetSongBpm } from "@/lib/bpm/getsongbpm";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(json: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => json })));
}

describe("lookupGetSongBpm", () => {
  it("returns null when no API key is configured", async () => {
    delete process.env.GETSONGBPM_API_KEY;
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toBeNull();
  });

  it("parses tempo from a search hit", async () => {
    process.env.GETSONGBPM_API_KEY = "k";
    mockFetch({ search: [{ tempo: "140", song_title: "T", artist: { name: "A" } }] });
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toMatchObject({ bpm: 140, source: "getsongbpm" });
  });

  it("returns null on empty search", async () => {
    process.env.GETSONGBPM_API_KEY = "k";
    mockFetch({ search: [] });
    const res = await lookupGetSongBpm({ id: "s1", title: "T", artist: "A" });
    expect(res).toBeNull();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/bpm/getsongbpm.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/bpm/getsongbpm.ts`**

```typescript
import type { BpmLookupResult, TrackRef } from "./types";
import { titleArtistConfidence } from "./match";

const BASE = "https://api.getsong.co";

interface GsbHit {
  tempo?: string;
  song_title?: string;
  artist?: { name?: string };
}

export async function lookupGetSongBpm(ref: TrackRef): Promise<BpmLookupResult | null> {
  const key = process.env.GETSONGBPM_API_KEY;
  if (!key) return null;
  const lookup = encodeURIComponent(`song:${ref.title} artist:${ref.artist}`);
  const res = await fetch(`${BASE}/search/?api_key=${key}&type=both&lookup=${lookup}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { search?: GsbHit[] };
  const hit = json.search?.find((h) => h.tempo && Number(h.tempo) > 0);
  if (!hit || !hit.tempo) return null;
  return {
    bpm: Number(hit.tempo),
    source: "getsongbpm",
    matchedTitle: hit.song_title ?? ref.title,
    matchedArtist: hit.artist?.name ?? ref.artist,
    confidence: titleArtistConfidence(ref.title, ref.artist, hit.song_title ?? "", hit.artist?.name ?? ""),
  };
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/bpm/getsongbpm.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bpm/getsongbpm.ts tests/lib/bpm/getsongbpm.test.ts
git commit -m "feat(bpm): GetSongBPM fallback client"
```

### Task 3.4: Enrichment orchestrator

**Files:**
- Create: `src/lib/bpm/enrich.ts`
- Test: `tests/lib/bpm/enrich.test.ts`

- [ ] **Step 1: Write the failing test with injected deps**

Create `tests/lib/bpm/enrich.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { enrichTracks } from "@/lib/bpm/enrich";
import { MemoryStore } from "@/lib/store/memory-store";
import type { TrackRef } from "@/lib/bpm/types";

const refs: TrackRef[] = [
  { id: "cached", title: "C", artist: "A", isrc: "I1" },
  { id: "deezer", title: "D", artist: "A", isrc: "I2" },
  { id: "gsb", title: "G", artist: "A" },
  { id: "miss", title: "M", artist: "A" },
];

describe("enrichTracks", () => {
  it("returns cache hits without calling sources, and persists new results", async () => {
    const store = new MemoryStore([
      { trackId: "cached", bpm: 111, source: "deezer-isrc", matchedTitle: "C", matchedArtist: "A", confidence: 1, fetchedAt: "x" },
    ]);
    const deezer = vi.fn(async (r: TrackRef) =>
      r.id === "deezer" ? { bpm: 122, source: "deezer-isrc" as const, matchedTitle: "D", matchedArtist: "A", confidence: 1 } : null,
    );
    const gsb = vi.fn(async (r: TrackRef) =>
      r.id === "gsb" ? { bpm: 133, source: "getsongbpm" as const, matchedTitle: "G", matchedArtist: "A", confidence: 0.9 } : null,
    );

    const out = await enrichTracks(refs, store, { deezer, gsb, now: () => "2026-07-08T00:00:00Z" });

    expect(deezer).not.toHaveBeenCalledWith(expect.objectContaining({ id: "cached" }));
    expect(out.matched.map((m) => m.trackId).sort()).toEqual(["cached", "deezer", "gsb"]);
    expect(out.unmatched).toEqual(["miss"]);
    // gsb only called when deezer returned null
    expect(gsb).toHaveBeenCalledWith(expect.objectContaining({ id: "gsb" }));
    expect(gsb).not.toHaveBeenCalledWith(expect.objectContaining({ id: "deezer" }));
    // newly matched persisted
    expect((await store.getBpm("deezer"))?.bpm).toBe(122);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/bpm/enrich.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/bpm/enrich.ts`**

```typescript
import type { Store, BpmCacheEntry } from "../store/types";
import type { BpmLookupResult, TrackRef } from "./types";
import { lookupDeezer } from "./deezer";
import { lookupGetSongBpm } from "./getsongbpm";

export interface EnrichDeps {
  deezer?: (ref: TrackRef) => Promise<BpmLookupResult | null>;
  gsb?: (ref: TrackRef) => Promise<BpmLookupResult | null>;
  now?: () => string;
}

export interface EnrichOutput {
  matched: BpmCacheEntry[];
  unmatched: string[];
}

export async function enrichTracks(
  refs: TrackRef[],
  store: Store,
  deps: EnrichDeps = {},
): Promise<EnrichOutput> {
  const deezer = deps.deezer ?? lookupDeezer;
  const gsb = deps.gsb ?? lookupGetSongBpm;
  const now = deps.now ?? (() => new Date().toISOString());

  const cached = await store.getManyBpm(refs.map((r) => r.id));
  const matched: BpmCacheEntry[] = [];
  const unmatched: string[] = [];

  for (const ref of refs) {
    if (cached[ref.id]) {
      matched.push(cached[ref.id]);
      continue;
    }
    const result = (await deezer(ref)) ?? (await gsb(ref));
    if (!result) {
      unmatched.push(ref.id);
      continue;
    }
    const entry: BpmCacheEntry = {
      trackId: ref.id,
      bpm: result.bpm,
      source: result.source,
      matchedTitle: result.matchedTitle,
      matchedArtist: result.matchedArtist,
      confidence: result.confidence,
      fetchedAt: now(),
    };
    await store.putBpm(entry);
    matched.push(entry);
  }

  return { matched, unmatched };
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/bpm/enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bpm/enrich.ts tests/lib/bpm/enrich.test.ts
git commit -m "feat(bpm): cache-first enrichment orchestrator"
```

---

## Phase 4: `lib/spotify` — Web API client

### Task 4.1: Track normalization + pagination + 429 handling

**Files:**
- Create: `src/lib/spotify/types.ts`, `src/lib/spotify/client.ts`
- Test: `tests/lib/spotify/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/spotify/client.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { SpotifyClient } from "@/lib/spotify/client";

function seqFetch(responses: Array<{ status?: number; headers?: Record<string, string>; body: unknown }>) {
  let i = 0;
  return vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: (k: string) => (r.headers ?? {})[k.toLowerCase()] ?? null },
      json: async () => r.body,
    };
  });
}

describe("SpotifyClient", () => {
  it("normalizes liked tracks and follows pagination", async () => {
    const fetchMock = seqFetch([
      { body: { items: [{ track: { id: "1", name: "S1", duration_ms: 200000, artists: [{ name: "A1" }], external_ids: { isrc: "X1" } } }], next: "https://api.spotify.com/next" } },
      { body: { items: [{ track: { id: "2", name: "S2", duration_ms: 210000, artists: [{ name: "A2" }], external_ids: {} } }], next: null } },
    ]);
    const client = new SpotifyClient("tok", fetchMock as never);
    const tracks = await client.getLikedTracks();
    expect(tracks).toEqual([
      { id: "1", title: "S1", artist: "A1", durationMs: 200000, isrc: "X1" },
      { id: "2", title: "S2", artist: "A2", durationMs: 210000, isrc: undefined },
    ]);
  });

  it("retries after a 429 respecting Retry-After", async () => {
    const fetchMock = seqFetch([
      { status: 429, headers: { "retry-after": "0" }, body: {} },
      { body: { items: [], next: null } },
    ]);
    const client = new SpotifyClient("tok", fetchMock as never);
    const tracks = await client.getLikedTracks();
    expect(tracks).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/spotify/client.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/spotify/types.ts`**

```typescript
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
```

- [ ] **Step 4: Create `src/lib/spotify/client.ts`**

```typescript
import type { PlaylistSummary, SpotifyTrack } from "./types";

type FetchLike = typeof fetch;
const API = "https://api.spotify.com/v1";

interface RawTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: Array<{ name: string }>;
  external_ids?: { isrc?: string };
}

function normalize(t: RawTrack): SpotifyTrack {
  return {
    id: t.id,
    title: t.name,
    artist: t.artists?.[0]?.name ?? "",
    durationMs: t.duration_ms,
    isrc: t.external_ids?.isrc,
  };
}

export class SpotifyClient {
  constructor(private token: string, private fetchImpl: FetchLike = fetch) {}

  private async req<T>(url: string, init?: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      if (res.status === 429) {
        const retry = Number(res.headers.get("retry-after") ?? "1");
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Spotify ${res.status}: ${url}`);
      return (await res.json()) as T;
    }
    throw new Error(`Spotify rate-limited after retries: ${url}`);
  }

  /** Follow `next` pagination, extracting tracks with `pick`. */
  private async paginate(startUrl: string, pick: (item: unknown) => RawTrack | null): Promise<SpotifyTrack[]> {
    const out: SpotifyTrack[] = [];
    let url: string | null = startUrl;
    while (url) {
      const page = await this.req<{ items: unknown[]; next: string | null }>(url);
      for (const item of page.items) {
        const raw = pick(item);
        if (raw?.id) out.push(normalize(raw));
      }
      url = page.next;
    }
    return out;
  }

  getLikedTracks(): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/me/tracks?limit=50`, (i) => (i as { track: RawTrack }).track);
  }

  getTopTracks(range: "short_term" | "medium_term" | "long_term" = "medium_term"): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/me/top/tracks?limit=50&time_range=${range}`, (i) => i as RawTrack);
  }

  getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    return this.paginate(`${API}/playlists/${playlistId}/tracks?limit=100`, (i) => (i as { track: RawTrack | null }).track);
  }

  searchTracks(query: string, limit = 50): Promise<SpotifyTrack[]> {
    const url = `${API}/search?type=track&limit=${limit}&q=${encodeURIComponent(query)}`;
    return this.req<{ tracks: { items: RawTrack[] } }>(url).then((r) => r.tracks.items.filter((t) => t?.id).map(normalize));
  }

  async getUserPlaylists(): Promise<PlaylistSummary[]> {
    const out: PlaylistSummary[] = [];
    let url: string | null = `${API}/me/playlists?limit=50`;
    while (url) {
      const page = await this.req<{ items: Array<{ id: string; name: string; tracks: { total: number } }>; next: string | null }>(url);
      for (const p of page.items) out.push({ id: p.id, name: p.name, trackCount: p.tracks.total });
      url = page.next;
    }
    return out;
  }

  async getCurrentUserId(): Promise<string> {
    const me = await this.req<{ id: string }>(`${API}/me`);
    return me.id;
  }

  async createPlaylist(userId: string, name: string, description: string): Promise<string> {
    const res = await this.req<{ id: string }>(`${API}/users/${userId}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: false }),
    });
    return res.id;
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    for (let i = 0; i < trackIds.length; i += 100) {
      const uris = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`);
      await this.req(`${API}/playlists/${playlistId}/tracks`, { method: "POST", body: JSON.stringify({ uris }) });
    }
  }
}
```

- [ ] **Step 5: Run it green**

Run: `npx vitest run tests/lib/spotify/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/spotify tests/lib/spotify
git commit -m "feat(spotify): typed Web API client with pagination and 429 handling"
```

---

## Phase 5: `lib/pool` — merge + dedupe

### Task 5.1: Dedupe candidates

**Files:**
- Create: `src/lib/pool/dedupe.ts`
- Test: `tests/lib/pool/dedupe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pool/dedupe.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { dedupeTracks } from "@/lib/pool/dedupe";
import type { SpotifyTrack } from "@/lib/spotify/types";

const mk = (id: string, isrc?: string): SpotifyTrack => ({ id, title: "t", artist: "a", durationMs: 1000, isrc });

describe("dedupeTracks", () => {
  it("removes duplicate Spotify ids, keeping first occurrence", () => {
    const out = dedupeTracks([mk("1"), mk("2"), mk("1")]);
    expect(out.map((t) => t.id)).toEqual(["1", "2"]);
  });
  it("collapses different ids that share an ISRC", () => {
    const out = dedupeTracks([mk("1", "ISRC_A"), mk("2", "ISRC_A")]);
    expect(out.map((t) => t.id)).toEqual(["1"]);
  });
  it("keeps tracks without ISRC distinct", () => {
    const out = dedupeTracks([mk("1"), mk("2")]);
    expect(out).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/pool/dedupe.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/pool/dedupe.ts`**

```typescript
import type { SpotifyTrack } from "../spotify/types";

export function dedupeTracks(tracks: SpotifyTrack[]): SpotifyTrack[] {
  const seenIds = new Set<string>();
  const seenIsrc = new Set<string>();
  const out: SpotifyTrack[] = [];
  for (const t of tracks) {
    if (seenIds.has(t.id)) continue;
    if (t.isrc && seenIsrc.has(t.isrc)) continue;
    seenIds.add(t.id);
    if (t.isrc) seenIsrc.add(t.isrc);
    out.push(t);
  }
  return out;
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/pool/dedupe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pool tests/lib/pool
git commit -m "feat(pool): dedupe candidates by id and ISRC"
```

---

## Phase 6: `lib/auth` — Auth.js Spotify provider

### Task 6.1: Auth config with token refresh

**Files:**
- Create: `src/lib/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `.env.example`
- Test: `tests/lib/auth/refresh.test.ts`

- [ ] **Step 1: Write the failing test for the refresh helper**

Create `tests/lib/auth/refresh.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshSpotifyToken } from "@/lib/auth/config";

afterEach(() => vi.unstubAllGlobals());

describe("refreshSpotifyToken", () => {
  it("returns new access token and expiry on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new", expires_in: 3600 }),
    })));
    const out = await refreshSpotifyToken("refresh-tok", "id", "secret", () => 1_000_000);
    expect(out.accessToken).toBe("new");
    expect(out.expiresAt).toBe(1_000_000 + 3600 * 1000);
    expect(out.error).toBeUndefined();
  });

  it("returns an error marker on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const out = await refreshSpotifyToken("refresh-tok", "id", "secret", () => 0);
    expect(out.error).toBe("RefreshFailed");
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/auth/refresh.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/auth/config.ts`**

```typescript
import NextAuth, { type NextAuthConfig } from "next-auth";
import Spotify from "next-auth/providers/spotify";

const SCOPES = [
  "user-library-read",
  "user-top-read",
  "playlist-read-private",
  "playlist-modify-private",
].join(" ");

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

export const authConfig: NextAuthConfig = {
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      authorization: { params: { scope: SCOPES } },
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
```

- [ ] **Step 4: Create `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
import { handlers } from "@/lib/auth/config";
export const { GET, POST } = handlers;
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Spotify app credentials (create at https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
# Must exactly match a Redirect URI in your Spotify app settings:
#   http://localhost:3000/api/auth/callback/spotify  (local)
#   https://<your-app>.vercel.app/api/auth/callback/spotify  (prod)
NEXTAUTH_URL=http://localhost:3000
# Generate with: openssl rand -base64 32
AUTH_SECRET=

# Optional BPM fallback source (https://getsongbpm.com/api). Requires a footer backlink.
GETSONGBPM_API_KEY=

# Optional persistent cache + history (Vercel KV / Upstash). Omit to run in-memory.
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

- [ ] **Step 6: Run it green**

Run: `npx vitest run tests/lib/auth/refresh.test.ts`
Expected: PASS (2 tests). If `next-auth` import breaks the test environment, the test only imports `refreshSpotifyToken`; if needed, move `refreshSpotifyToken` to `src/lib/auth/refresh.ts` and re-import from there in `config.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth src/app/api/auth .env.example tests/lib/auth
git commit -m "feat(auth): Auth.js Spotify provider with token refresh"
```

---

## Phase 7: API routes

### Task 7.1: Shared session→client helper

**Files:**
- Create: `src/lib/spotify/session.ts`
- Test: `tests/lib/spotify/session.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/spotify/session.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { tokenFromSession } from "@/lib/spotify/session";

describe("tokenFromSession", () => {
  it("returns the access token when present", () => {
    expect(tokenFromSession({ accessToken: "tok" })).toBe("tok");
  });
  it("throws when the session has a refresh error", () => {
    expect(() => tokenFromSession({ accessToken: "tok", error: "RefreshFailed" })).toThrow(/re-?login/i);
  });
  it("throws when no token", () => {
    expect(() => tokenFromSession({})).toThrow(/not authenticated/i);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/spotify/session.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/spotify/session.ts`**

```typescript
export interface SessionLike {
  accessToken?: string;
  error?: string;
}

export function tokenFromSession(session: SessionLike | null): string {
  if (session?.error) throw new Error("Session expired — please re-login.");
  if (!session?.accessToken) throw new Error("Not authenticated.");
  return session.accessToken;
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/spotify/session.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/spotify/session.ts tests/lib/spotify/session.test.ts
git commit -m "feat(spotify): session token extraction helper"
```

### Task 7.2: `/api/enrich` route (chunked)

**Files:**
- Create: `src/lib/pool/build.ts`, `src/app/api/enrich/route.ts`
- Test: `tests/lib/pool/build.test.ts`

The route resolves candidate `TrackRef`s for a chunk and enriches them. To keep the route thin and testable, the pool-resolution logic lives in `lib/pool/build.ts`.

- [ ] **Step 1: Write the failing test for `resolvePool`**

Create `tests/lib/pool/build.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { resolvePool } from "@/lib/pool/build";
import type { SpotifyTrack } from "@/lib/spotify/types";

const mk = (id: string): SpotifyTrack => ({ id, title: id, artist: "a", durationMs: 1000, isrc: `ISRC_${id}` });

describe("resolvePool", () => {
  it("gathers only selected sources and dedupes", async () => {
    const client = {
      getLikedTracks: vi.fn(async () => [mk("1"), mk("2")]),
      getTopTracks: vi.fn(async () => [mk("2"), mk("3")]),
      getPlaylistTracks: vi.fn(async () => [mk("4")]),
      searchTracks: vi.fn(async () => [mk("5")]),
    };
    const out = await resolvePool(client as never, {
      liked: true,
      top: true,
      playlistIds: ["p1"],
      genreQuery: "techno",
    });
    expect(out.map((t) => t.id).sort()).toEqual(["1", "2", "3", "4", "5"]);
    expect(client.searchTracks).toHaveBeenCalledWith("techno");
  });

  it("skips sources that are not selected", async () => {
    const client = {
      getLikedTracks: vi.fn(async () => [mk("1")]),
      getTopTracks: vi.fn(async () => [mk("2")]),
      getPlaylistTracks: vi.fn(async () => []),
      searchTracks: vi.fn(async () => []),
    };
    const out = await resolvePool(client as never, { liked: true, top: false, playlistIds: [], genreQuery: "" });
    expect(out.map((t) => t.id)).toEqual(["1"]);
    expect(client.getTopTracks).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/pool/build.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/pool/build.ts`**

```typescript
import type { SpotifyClient } from "../spotify/client";
import type { SpotifyTrack } from "../spotify/types";
import { dedupeTracks } from "./dedupe";

export interface PoolSelection {
  liked: boolean;
  top: boolean;
  playlistIds: string[];
  genreQuery: string;
}

export async function resolvePool(client: SpotifyClient, sel: PoolSelection): Promise<SpotifyTrack[]> {
  const all: SpotifyTrack[] = [];
  if (sel.liked) all.push(...(await client.getLikedTracks()));
  if (sel.top) all.push(...(await client.getTopTracks()));
  for (const pid of sel.playlistIds) all.push(...(await client.getPlaylistTracks(pid)));
  if (sel.genreQuery.trim()) all.push(...(await client.searchTracks(sel.genreQuery.trim())));
  return dedupeTracks(all);
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/pool/build.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the enrich route `src/app/api/enrich/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { getStore } from "@/lib/store";
import { enrichTracks } from "@/lib/bpm/enrich";
import type { TrackRef } from "@/lib/bpm/types";

export const maxDuration = 60;

const Body = z.object({
  tracks: z
    .array(z.object({ id: z.string(), title: z.string(), artist: z.string(), isrc: z.string().optional() }))
    .max(50),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    tokenFromSession(session as never); // authz gate
    const { tracks } = Body.parse(await req.json());
    const store = await getStore();
    const out = await enrichTracks(tracks as TrackRef[], store);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/pool/build.ts src/app/api/enrich tests/lib/pool/build.test.ts
git commit -m "feat(api): pool resolution + chunked enrich route"
```

### Task 7.3: `/api/generate` and `/api/save` routes

**Files:**
- Create: `src/app/api/generate/route.ts`, `src/app/api/save/route.ts`
- Test: `tests/lib/generate.test.ts`

The heavy logic (`resolvePool`, `enrichTracks`, `fillCurve`) is already tested. These routes are thin composition; we unit-test the one new pure piece — assembling a `CurveTrack[]` from pool + bpm entries — via a small helper.

- [ ] **Step 1: Write the failing test for `toCurveTracks`**

Create `tests/lib/generate.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { toCurveTracks } from "@/lib/pool/build";
import type { SpotifyTrack } from "@/lib/spotify/types";
import type { BpmCacheEntry } from "@/lib/store/types";

const track = (id: string): SpotifyTrack => ({ id, title: id, artist: "a", durationMs: 60000, isrc: undefined });
const bpm = (id: string, b: number): BpmCacheEntry => ({ trackId: id, bpm: b, source: "deezer-isrc", matchedTitle: id, matchedArtist: "a", confidence: 1, fetchedAt: "x" });

describe("toCurveTracks", () => {
  it("keeps only tracks that have a bpm entry, mapping bpm + duration", () => {
    const out = toCurveTracks([track("1"), track("2")], { 1: bpm("1", 120) });
    expect(out).toEqual([{ id: "1", bpm: 120, durationMs: 60000 }]);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/lib/generate.test.ts`
Expected: FAIL — `toCurveTracks` not exported.

- [ ] **Step 3: Add `toCurveTracks` to `src/lib/pool/build.ts`**

```typescript
import type { CurveTrack } from "../curve/types";
import type { BpmCacheEntry } from "../store/types";

export function toCurveTracks(
  tracks: SpotifyTrack[],
  bpmById: Record<string, BpmCacheEntry>,
): CurveTrack[] {
  const out: CurveTrack[] = [];
  for (const t of tracks) {
    const entry = bpmById[t.id];
    if (entry) out.push({ id: t.id, bpm: entry.bpm, durationMs: t.durationMs });
  }
  return out;
}
```

- [ ] **Step 4: Run it green**

Run: `npx vitest run tests/lib/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/app/api/generate/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { resolvePool, toCurveTracks } from "@/lib/pool/build";
import { getStore } from "@/lib/store";
import { fillCurve } from "@/lib/curve/fill";

export const maxDuration = 60;

const Body = z.object({
  sources: z.object({
    liked: z.boolean(),
    top: z.boolean(),
    playlistIds: z.array(z.string()),
    genreQuery: z.string(),
  }),
  startBpm: z.number().min(30).max(300),
  endBpm: z.number().min(30).max(300),
  targetMinutes: z.number().min(1).max(600),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const token = tokenFromSession(session as never);
    const body = Body.parse(await req.json());
    const client = new SpotifyClient(token);
    const pool = await resolvePool(client, body.sources);

    // Only use already-cached bpm here; UI runs /enrich first for full coverage.
    const store = await getStore();
    const bpmById = await store.getManyBpm(pool.map((t) => t.id));
    const curveTracks = toCurveTracks(pool, bpmById);

    const result = fillCurve({
      tracks: curveTracks,
      startBpm: body.startBpm,
      endBpm: body.endBpm,
      targetMinutes: body.targetMinutes,
    });

    // Enrich the response with title/artist for display.
    const byId = new Map(pool.map((t) => [t.id, t]));
    const tracks = result.tracks.map((r) => ({
      id: r.track.id,
      title: byId.get(r.track.id)?.title ?? "",
      artist: byId.get(r.track.id)?.artist ?? "",
      bpm: r.track.bpm,
      target: Math.round(r.target),
      deviation: Math.round(r.deviation),
    }));

    return NextResponse.json({
      tracks,
      achievedMinutes: Math.round(result.achievedMs / 60000),
      poolSize: pool.length,
      matchedSize: curveTracks.length,
      fidelity: result.fidelity,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 6: Create `src/app/api/save/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { getStore } from "@/lib/store";

export const maxDuration = 60;

const Body = z.object({
  name: z.string().min(1).max(100),
  trackIds: z.array(z.string()).min(1),
  params: z.object({
    startBpm: z.number(),
    endBpm: z.number(),
    targetMinutes: z.number(),
    sources: z.array(z.string()),
  }),
  fidelity: z.object({ maxDeviation: z.number(), avgDeviation: z.number(), widenedCount: z.number() }),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const token = tokenFromSession(session as never);
    const body = Body.parse(await req.json());
    const client = new SpotifyClient(token);
    const userId = await client.getCurrentUserId();
    const playlistId = await client.createPlaylist(
      userId,
      body.name,
      `Crescendo ${body.params.startBpm}->${body.params.endBpm} BPM over ${body.params.targetMinutes}min`,
    );
    await client.addTracks(playlistId, body.trackIds);

    const store = await getStore();
    if (store.persistent) {
      await store.putGeneration({
        id: playlistId,
        createdAt: new Date().toISOString(),
        params: body.params,
        trackIds: body.trackIds,
        playlistId,
        fidelity: body.fidelity,
      });
    }
    return NextResponse.json({ playlistId, url: `https://open.spotify.com/playlist/${playlistId}`, historySaved: store.persistent });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/generate src/app/api/save src/lib/pool/build.ts tests/lib/generate.test.ts
git commit -m "feat(api): generate (fill) and save (playlist) routes"
```

---

## Phase 8: UI

### Task 8.1: Auth landing + session provider

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/components/LoginGate.tsx`

- [ ] **Step 1: Create `src/components/LoginGate.tsx`**

```tsx
"use client";
import { signIn } from "next-auth/react";

export function LoginGate() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Crescendo</h1>
      <p className="max-w-md text-neutral-400">
        Generate a Spotify playlist that follows a BPM curve. Log in with your own Spotify account.
      </p>
      <button
        onClick={() => signIn("spotify")}
        className="rounded-full bg-green-500 px-8 py-3 font-semibold text-black hover:bg-green-400"
      >
        Log in with Spotify
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import { auth, signOut } from "@/lib/auth/config";
import { LoginGate } from "@/components/LoginGate";
import { Studio } from "@/components/Studio";

export default async function Home() {
  const session = await auth();
  if (!session || (session as unknown as { error?: string }).error) return <LoginGate />;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Crescendo</h1>
        <form action={async () => { "use server"; await signOut(); }}>
          <button className="text-sm text-neutral-400 hover:text-white">Log out</button>
        </form>
      </header>
      <Studio />
      <footer className="mt-12 text-center text-xs text-neutral-500">
        BPM data from Deezer and{" "}
        <a className="underline" href="https://getsongbpm.com" target="_blank" rel="noreferrer">GetSongBPM</a>.
      </footer>
    </main>
  );
}
```

- [ ] **Step 3: Verify build compiles**

Run: `npx next build`
Expected: build succeeds (the `Studio` import will fail until Task 8.2 — if building now, comment out the `Studio` import/usage, or do this step after 8.2). Note in commit that Studio arrives next.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/LoginGate.tsx
git commit -m "feat(ui): login gate and authenticated shell with attribution footer"
```

### Task 8.2: The Studio (source picker + curve controls + orchestration)

**Files:**
- Create: `src/components/Studio.tsx`, `src/components/SourcePicker.tsx`, `src/components/CurveControls.tsx`, `src/components/EnrichProgress.tsx`, `src/components/ResultsView.tsx`
- Create: `src/app/api/playlists/route.ts` (list playlists for the picker)

- [ ] **Step 1: Create the playlists route `src/app/api/playlists/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";

export async function GET() {
  try {
    const session = await auth();
    const token = tokenFromSession(session as never);
    const client = new SpotifyClient(token);
    return NextResponse.json({ playlists: await client.getUserPlaylists() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 2: Create `src/components/SourcePicker.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

export interface Sources {
  liked: boolean;
  top: boolean;
  playlistIds: string[];
  genreQuery: string;
}

export function SourcePicker({ value, onChange }: { value: Sources; onChange: (s: Sources) => void }) {
  const [playlists, setPlaylists] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/playlists").then((r) => r.json()).then((d) => setPlaylists(d.playlists ?? []));
  }, []);

  const toggle = (k: "liked" | "top") => onChange({ ...value, [k]: !value[k] });
  const togglePlaylist = (id: string) =>
    onChange({
      ...value,
      playlistIds: value.playlistIds.includes(id)
        ? value.playlistIds.filter((p) => p !== id)
        : [...value.playlistIds, id],
    });

  return (
    <section className="space-y-3 rounded-lg border border-neutral-800 p-4">
      <h2 className="font-semibold">Candidate pool</h2>
      <label className="flex items-center gap-2"><input type="checkbox" checked={value.liked} onChange={() => toggle("liked")} /> Liked songs</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={value.top} onChange={() => toggle("top")} /> Top tracks</label>
      <input
        className="w-full rounded bg-neutral-900 px-3 py-2"
        placeholder="Genre / keyword search (optional)"
        value={value.genreQuery}
        onChange={(e) => onChange({ ...value, genreQuery: e.target.value })}
      />
      <details>
        <summary className="cursor-pointer text-sm text-neutral-400">Playlists ({value.playlistIds.length} selected)</summary>
        <div className="mt-2 max-h-48 space-y-1 overflow-auto">
          {playlists.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={value.playlistIds.includes(p.id)} onChange={() => togglePlaylist(p.id)} /> {p.name}
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/components/CurveControls.tsx`**

```tsx
"use client";

export interface Curve {
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
}

export function CurveControls({ value, onChange }: { value: Curve; onChange: (c: Curve) => void }) {
  const num = (k: keyof Curve) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: Number(e.target.value) });
  return (
    <section className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-800 p-4">
      <label className="flex flex-col text-sm">Start BPM
        <input type="number" className="rounded bg-neutral-900 px-2 py-1" value={value.startBpm} onChange={num("startBpm")} />
      </label>
      <label className="flex flex-col text-sm">End BPM
        <input type="number" className="rounded bg-neutral-900 px-2 py-1" value={value.endBpm} onChange={num("endBpm")} />
      </label>
      <label className="flex flex-col text-sm">Minutes
        <input type="number" className="rounded bg-neutral-900 px-2 py-1" value={value.targetMinutes} onChange={num("targetMinutes")} />
      </label>
    </section>
  );
}
```

- [ ] **Step 4: Create `src/components/EnrichProgress.tsx`**

```tsx
"use client";

export function EnrichProgress({ done, total, matched }: { done: number; total: number; matched: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-neutral-400">Enriching BPM: {done}/{total} — {matched} matched</p>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/components/ResultsView.tsx`**

```tsx
"use client";

export interface ResultTrack { id: string; title: string; artist: string; bpm: number; target: number; deviation: number }
export interface GenerateResult {
  tracks: ResultTrack[];
  achievedMinutes: number;
  poolSize: number;
  matchedSize: number;
  fidelity: { maxDeviation: number; avgDeviation: number; widenedCount: number };
}

export function ResultsView({ result, onSave, saving, savedUrl }: {
  result: GenerateResult; onSave: () => void; saving: boolean; savedUrl: string | null;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between text-sm text-neutral-400">
        <span>{result.tracks.length} tracks · {result.achievedMinutes} min · {result.matchedSize}/{result.poolSize} pool had BPM</span>
        {result.fidelity.widenedCount > 0 && (
          <span title="slots where we widened past ±3 BPM">curve stretched on {result.fidelity.widenedCount} tracks</span>
        )}
      </div>
      <ol className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {result.tracks.map((t, i) => (
          <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="truncate">{i + 1}. {t.title} — <span className="text-neutral-400">{t.artist}</span></span>
            <span className="tabular-nums text-neutral-400">{t.bpm} bpm (→{t.target})</span>
          </li>
        ))}
      </ol>
      {savedUrl ? (
        <a href={savedUrl} target="_blank" rel="noreferrer" className="inline-block rounded-full bg-green-500 px-6 py-2 font-semibold text-black">Open in Spotify ↗</a>
      ) : (
        <button onClick={onSave} disabled={saving} className="rounded-full bg-green-500 px-6 py-2 font-semibold text-black disabled:opacity-50">
          {saving ? "Saving…" : "Save as private playlist"}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Create `src/components/Studio.tsx` (orchestrator)**

```tsx
"use client";
import { useState } from "react";
import { SourcePicker, type Sources } from "./SourcePicker";
import { CurveControls, type Curve } from "./CurveControls";
import { EnrichProgress } from "./EnrichProgress";
import { ResultsView, type GenerateResult } from "./ResultsView";

const CHUNK = 50;

export function Studio() {
  const [sources, setSources] = useState<Sources>({ liked: true, top: false, playlistIds: [], genreQuery: "" });
  const [curve, setCurve] = useState<Curve>({ startBpm: 100, endBpm: 128, targetMinutes: 45 });
  const [progress, setProgress] = useState<{ done: number; total: number; matched: number } | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null); setSavedUrl(null); setProgress(null);
    try {
      // 1. Resolve the pool (returns display tracks incl. ids/isrc) via a light generate call is not enough;
      //    we need the raw pool to enrich. Use a dedicated pool fetch embedded in /api/generate's pre-step:
      const poolRes = await fetch("/api/pool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources }) });
      const pool: { id: string; title: string; artist: string; isrc?: string }[] = (await poolRes.json()).tracks ?? [];
      // 2. Enrich in chunks.
      let matched = 0;
      for (let i = 0; i < pool.length; i += CHUNK) {
        const chunk = pool.slice(i, i + CHUNK);
        const r = await fetch("/api/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracks: chunk }) });
        const data = await r.json();
        matched += (data.matched?.length ?? 0);
        setProgress({ done: Math.min(i + CHUNK, pool.length), total: pool.length, matched });
      }
      // 3. Fill the curve (uses now-warm cache).
      const genRes = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources, ...curve }) });
      const gen = await genRes.json();
      if (gen.error) throw new Error(gen.error);
      setResult(gen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Crescendo ${curve.startBpm}→${curve.endBpm} (${curve.targetMinutes}m)`,
          trackIds: result.tracks.map((t) => t.id),
          params: { ...curve, sources: [sources.liked && "liked", sources.top && "top", sources.playlistIds.length && "playlists", sources.genreQuery && "search"].filter(Boolean) as string[] },
          fidelity: result.fidelity,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedUrl(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SourcePicker value={sources} onChange={setSources} />
      <CurveControls value={curve} onChange={setCurve} />
      <button onClick={run} disabled={busy} className="rounded-full bg-white px-6 py-2 font-semibold text-black disabled:opacity-50">
        {busy ? "Working…" : "Generate"}
      </button>
      {progress && !result && <EnrichProgress {...progress} />}
      {error && <p className="rounded bg-red-950 p-3 text-sm text-red-300">{error}</p>}
      {result && <ResultsView result={result} onSave={save} saving={saving} savedUrl={savedUrl} />}
    </div>
  );
}
```

- [ ] **Step 7: Add the `/api/pool` route `src/app/api/pool/route.ts`**

The Studio needs the raw pool (ids + title/artist/isrc) to drive chunked enrichment. Add a thin route:
```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { tokenFromSession } from "@/lib/spotify/session";
import { SpotifyClient } from "@/lib/spotify/client";
import { resolvePool } from "@/lib/pool/build";

export const maxDuration = 60;

const Body = z.object({
  sources: z.object({ liked: z.boolean(), top: z.boolean(), playlistIds: z.array(z.string()), genreQuery: z.string() }),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const token = tokenFromSession(session as never);
    const { sources } = Body.parse(await req.json());
    const pool = await resolvePool(new SpotifyClient(token), sources);
    return NextResponse.json({ tracks: pool.map((t) => ({ id: t.id, title: t.title, artist: t.artist, isrc: t.isrc })) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 8: Build**

Run: `npx next build`
Expected: build succeeds with no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/components src/app/api/playlists src/app/api/pool
git commit -m "feat(ui): Studio with source picker, curve controls, chunked enrich, results"
```

---

## Phase 9: Deploy story + docs + seed cache

### Task 9.1: README with setup walkthrough + Deploy button

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write `README.md`**

Replace `README.md` with setup docs. Include, in order:
1. One-paragraph description + the single-user/self-hosted model + "under 10 minutes" promise.
2. **Deploy to Vercel** button:
   ```markdown
   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<owner>/crescendo&env=SPOTIFY_CLIENT_ID,SPOTIFY_CLIENT_SECRET,AUTH_SECRET,NEXTAUTH_URL)
   ```
3. **Spotify dashboard setup** (numbered, note where screenshots go with `![...](docs/img/...)` placeholders): create app → copy Client ID/Secret → add Redirect URI `https://<app>.vercel.app/api/auth/callback/spotify` → add your own account under Users & Access (dev mode).
4. **Env vars** table mirroring `.env.example` (required vs optional; call out that KV enables persistent cache + history, and `GETSONGBPM_API_KEY` enables the fallback and requires the footer backlink — already included).
5. **Local dev**: `cp .env.example .env.local`, fill values, `npm install`, `npm run dev`.
6. MIT license + personal-use disclaimer paragraph (compliant with Spotify Developer Terms; each user runs their own dev-mode app).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: setup walkthrough, Deploy button, env reference, disclaimer"
```

### Task 9.2: Seed cache format + optional generator note

**Files:**
- Modify: `data/bpm-cache.json` (keep `[]` for now), `README.md`

- [ ] **Step 1: Document the seed format**

Add a short "Warm start (optional)" section to `README.md` describing the `data/bpm-cache.json` array shape (one `BpmCacheEntry` per object, keyed by Spotify track ID) so contributors can commit a popular-tracks seed. Ship it empty (`[]`) — the app works cold, just slower on first run.

- [ ] **Step 2: Commit**

```bash
git add README.md data/bpm-cache.json
git commit -m "docs: document seed BPM cache format"
```

### Task 9.3: Full test + build gate

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 2: Production build**

Run: `npx next build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Manual end-to-end (documented, requires real Spotify app)**

Following the README: set env vars → `npm run dev` → log in → select Liked songs → set 100→128 over 20 min → Generate → watch progress → Save → open playlist in Spotify. Confirm the playlist exists and track order ascends in BPM. Record the result in the PR description.

- [ ] **Step 4: Commit any fixes and finish**

```bash
git add -A
git commit -m "chore: verify full suite + build green"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** auth (Phase 6), 4 pool sources (Phase 7.2 `resolvePool`), merge/dedupe (Phase 5), enrichment cache→Deezer→GetSongBPM (Phase 3), linear ramp by duration (Phase 1), widen-then-nearest (Phase 1.2), save private playlist (Phase 7.3), history only when persistent (Phase 7.3 `save`), pluggable store w/ graceful degrade (Phase 2), attribution footer (Phase 8.1), Deploy button + README (Phase 9). Deferred items (curve editor, easing, key matching, manual override) are intentionally absent.
- **Deferred/nice-to-have:** a generation-history UI is not built (history is written but only re-surfaced via KV inspection); add a `/history` view later if wanted.
- **Type consistency:** `Store`, `BpmCacheEntry`, `CurveTrack`, `SpotifyTrack`, `TrackRef`, `Sources`, `Curve`, `GenerateResult` are defined once and reused across tasks.
