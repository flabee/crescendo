import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSimilarity } from "@/lib/similarity/similarity-service";
import { cosineSimilarity } from "@/lib/similarity/cosine";
import type { SpotifyTrack } from "@/lib/spotify/types";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import type { DeezerPreviewResult } from "@/lib/deezer/preview";

/**
 * Minimal thenable fake for the two Supabase call shapes embeddings-store.ts
 * uses: `.from("track_embeddings").select(...).eq(...).in(...)` and
 * `.from("track_embeddings").upsert(...)`, plus `.rpc("match_track_embeddings", ...)`.
 * Backed by an in-memory map so cache-first behavior is exercised for real.
 */
class FakeSupabase {
  rows = new Map<string, { track_id: string; embedding: number[] }>();

  from(_table: string) {
    const db = this;
    let mode: "select" | "upsert" = "select";
    let ids: string[] = [];
    let model = "";
    let upsertRow: Record<string, unknown> | null = null;

    const builder = {
      select(_cols: string) {
        mode = "select";
        return builder;
      },
      eq(_col: string, val: string) {
        model = val;
        return builder;
      },
      in(_col: string, vals: string[]) {
        ids = vals;
        return builder;
      },
      upsert(row: Record<string, unknown>) {
        mode = "upsert";
        upsertRow = row;
        return builder;
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        if (mode === "upsert" && upsertRow) {
          const row = upsertRow as { track_id: string; model: string; embedding: number[] };
          db.rows.set(`${row.track_id}:${row.model}`, { track_id: row.track_id, embedding: row.embedding });
          return Promise.resolve({ error: null }).then(resolve, reject);
        }
        const data = ids
          .map((id) => db.rows.get(`${id}:${model}`))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => ({ track_id: r.track_id, embedding: r.embedding }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  rpc(_name: string, params: { query_embedding: number[]; match_model: string; candidate_ids: string[] }) {
    const { query_embedding, match_model, candidate_ids } = params;
    const data = candidate_ids
      .map((id) => this.rows.get(`${id}:${match_model}`))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map((r) => ({ track_id: r.track_id, similarity: cosineSimilarity(query_embedding, r.embedding) }))
      .sort((a, b) => b.similarity - a.similarity);
    return Promise.resolve({ data, error: null });
  }
}

function track(id: string, title = id, artist = "Artist"): SpotifyTrack {
  return { id, title, artist, durationMs: 200_000, isrc: `ISRC-${id}` };
}

// Deterministic "embeddings": encode the track id in a 3-d vector so ranking
// is easy to reason about without a real model.
const VECTORS: Record<string, number[]> = {
  seed: [1, 0, 0],
  same: [1, 0, 0],
  close: [0.9, 0.1, 0],
  far: [0, 1, 0],
};

function makeProvider(calls: string[]): EmbeddingProvider {
  return {
    modelId: "test/model@v1",
    dimensions: 3,
    async embed(previewUrl: string) {
      calls.push(previewUrl);
      const id = previewUrl.replace("https://preview/", "");
      return VECTORS[id] ?? [0, 0, 1];
    },
  };
}

function makePreviewLookup(available: Set<string>) {
  return async (ref: { id: string }): Promise<DeezerPreviewResult | null> => {
    if (!available.has(ref.id)) return null;
    return { previewUrl: `https://preview/${ref.id}`, isrc: `ISRC-${ref.id}`, matchedTitle: ref.id, matchedArtist: "Artist", confidence: 1 };
  };
}

describe("resolveSimilarity", () => {
  it("ranks candidates by cosine similarity to the seed", async () => {
    const tracks = [track("seed"), track("same"), track("close"), track("far")];
    const spotify = { getTracksByIds: vi.fn(async (ids: string[]) => tracks.filter((t) => ids.includes(t.id))) };
    const embedCalls: string[] = [];

    const result = await resolveSimilarity("seed", ["same", "close", "far"], {
      spotify,
      lookupPreview: makePreviewLookup(new Set(["seed", "same", "close", "far"])),
      provider: makeProvider(embedCalls),
      supabase: new FakeSupabase() as unknown as SupabaseClient,
    });

    expect(result.ranked.map((r) => r.trackId)).toEqual(["same", "close", "far"]);
    expect(result.ranked[0].score).toBeCloseTo(1);
    expect(result.skipped).toEqual([]);
    expect(embedCalls).toHaveLength(4); // seed + 3 candidates, none cached yet
  });

  it("skips candidates missing from Spotify or with no Deezer preview, with reasons", async () => {
    const tracks = [track("seed"), track("same"), track("no-preview")];
    const spotify = { getTracksByIds: vi.fn(async (ids: string[]) => tracks.filter((t) => ids.includes(t.id))) };

    const result = await resolveSimilarity("seed", ["same", "missing-spotify", "no-preview"], {
      spotify,
      lookupPreview: makePreviewLookup(new Set(["seed", "same"])),
      provider: makeProvider([]),
      supabase: new FakeSupabase() as unknown as SupabaseClient,
    });

    expect(result.ranked.map((r) => r.trackId)).toEqual(["same"]);
    expect(result.skipped).toContainEqual({ trackId: "missing-spotify", reason: "Track not found on Spotify" });
    expect(result.skipped.find((s) => s.trackId === "no-preview")?.reason).toMatch(/deezer/i);
  });

  it("is cache-first: does not re-embed tracks already cached for the pinned model", async () => {
    const tracks = [track("seed"), track("same")];
    const spotify = { getTracksByIds: vi.fn(async (ids: string[]) => tracks.filter((t) => ids.includes(t.id))) };
    const supabase = new FakeSupabase();
    supabase.rows.set("same:test/model@v1", { track_id: "same", embedding: VECTORS.same });
    const embedCalls: string[] = [];

    const result = await resolveSimilarity("seed", ["same"], {
      spotify,
      lookupPreview: makePreviewLookup(new Set(["seed", "same"])),
      provider: makeProvider(embedCalls),
      supabase: supabase as unknown as SupabaseClient,
    });

    // Only the seed needed embedding; "same" was already cached.
    expect(embedCalls).toEqual(["https://preview/seed"]);
    expect(result.ranked.map((r) => r.trackId)).toEqual(["same"]);
  });

  it("throws when the seed itself cannot be resolved", async () => {
    const spotify = { getTracksByIds: vi.fn(async () => []) };
    await expect(
      resolveSimilarity("seed", [], {
        spotify,
        lookupPreview: makePreviewLookup(new Set()),
        provider: makeProvider([]),
        supabase: new FakeSupabase() as unknown as SupabaseClient,
      }),
    ).rejects.toThrow(/not found on spotify/i);
  });

  it("ranks a ~20-candidate pool end-to-end, mixing hits, cache hits, and misses", async () => {
    // Simulates the shape of a real /api/similarity call: one seed plus ~20
    // candidates, some already cached, some needing embedding, a couple
    // unresolvable. Live network calls (real Spotify/Deezer/Replicate/Supabase)
    // aren't available in this sandbox, so this exercises the same code path
    // (resolveSimilarity) with mocked deps instead.
    const N = 20;
    const ids = Array.from({ length: N }, (_, i) => `cand${i}`);
    const tracks = [track("seed"), ...ids.slice(0, N - 2).map((id) => track(id))]; // last 2 missing from Spotify
    const spotify = { getTracksByIds: vi.fn(async (queryIds: string[]) => tracks.filter((t) => queryIds.includes(t.id))) };

    // Every resolvable track gets a preview except one (simulated no-preview miss).
    const available = new Set(tracks.map((t) => t.id).filter((id) => id !== "cand5"));
    const vectors: Record<string, number[]> = { seed: [1, 0, 0] };
    for (const id of ids) vectors[id] = [1 - Number(id.replace("cand", "")) * 0.02, Number(id.replace("cand", "")) * 0.02, 0];

    const supabase = new FakeSupabase();
    // Pre-cache a few candidates so cache-first is exercised at this scale too.
    for (const id of ["cand0", "cand1", "cand2"]) {
      supabase.rows.set(`${id}:test/model@v1`, { track_id: id, embedding: vectors[id] });
    }

    const embedCalls: string[] = [];
    const provider: EmbeddingProvider = {
      modelId: "test/model@v1",
      dimensions: 3,
      async embed(previewUrl: string) {
        embedCalls.push(previewUrl);
        const id = previewUrl.replace("https://preview/", "");
        return vectors[id];
      },
    };

    const result = await resolveSimilarity("seed", ids, {
      spotify,
      lookupPreview: makePreviewLookup(available),
      provider,
      supabase: supabase as unknown as SupabaseClient,
    });

    // 2 missing from Spotify + 1 with no preview = 17 ranked.
    expect(result.ranked).toHaveLength(N - 3);
    expect(result.skipped).toHaveLength(3);
    // Ranked list is sorted highest similarity first.
    const scores = result.ranked.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // 3 candidates were pre-cached (+ seed always needs embedding) -> 14 embed calls, not 18.
    expect(embedCalls).toHaveLength(N - 3 - 3 + 1);
  });
});
