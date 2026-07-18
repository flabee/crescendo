import type { SupabaseClient } from "@supabase/supabase-js";
import type { SpotifyTrack } from "@/lib/spotify/types";
import { lookupDeezerPreview, type DeezerPreviewResult } from "@/lib/deezer/preview";
import { getEmbeddingProvider } from "@/lib/embeddings";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { getCachedEmbeddings, saveEmbedding, rankByCosine } from "./embeddings-store";

// Keeps us under Deezer's ~50/5s keyless limit and the embedding endpoint's
// rate limit without adding a full concurrency pool for a step-1 feature.
const DEEZER_PACING_MS = 120;
const EMBED_PACING_MS = 150;

export interface SpotifyTrackResolver {
  getTracksByIds(ids: string[]): Promise<SpotifyTrack[]>;
}

export interface SimilarityDeps {
  spotify: SpotifyTrackResolver;
  lookupPreview?: (ref: { id: string; title: string; artist: string; isrc?: string }) => Promise<DeezerPreviewResult | null>;
  provider?: EmbeddingProvider;
  supabase?: SupabaseClient;
}

export interface RankedCandidate {
  trackId: string;
  score: number;
}

export interface SkippedCandidate {
  trackId: string;
  reason: string;
}

export interface SimilarityResponse {
  seedTrackId: string;
  model: string;
  ranked: RankedCandidate[];
  skipped: SkippedCandidate[];
}

/**
 * Resolves each track to a Deezer 30s preview, embeds anything missing from
 * the cache (track_embeddings), and ranks candidates by cosine similarity to
 * the seed. Unresolvable candidates are skipped with a reason rather than
 * failing the whole request; an unresolvable seed fails the request (there is
 * nothing to rank against).
 */
export async function resolveSimilarity(
  seedTrackId: string,
  candidateTrackIds: string[],
  deps: SimilarityDeps,
): Promise<SimilarityResponse> {
  const lookupPreview = deps.lookupPreview ?? lookupDeezerPreview;
  const provider = deps.provider ?? getEmbeddingProvider();
  const supabase = deps.supabase ?? getSupabaseAdmin();
  const model = provider.modelId;

  const candidateIds = candidateTrackIds.filter((id) => id !== seedTrackId);
  const allIds = Array.from(new Set([seedTrackId, ...candidateIds]));
  const tracks = await deps.spotify.getTracksByIds(allIds);
  const byId = new Map(tracks.map((t) => [t.id, t]));

  const seedMeta = byId.get(seedTrackId);
  if (!seedMeta) throw new Error(`Seed track ${seedTrackId} not found on Spotify.`);

  const skipped: SkippedCandidate[] = [];
  for (const id of candidateIds) {
    if (!byId.has(id)) skipped.push({ trackId: id, reason: "Track not found on Spotify" });
  }

  // Resolve seed + resolvable candidates to Deezer previews, paced to stay
  // under Deezer's keyless rate limit. Seed first so its failure is fatal
  // before we spend time on candidates.
  const previews = new Map<string, DeezerPreviewResult>();
  const toResolve = [seedTrackId, ...candidateIds.filter((id) => byId.has(id))];
  for (let i = 0; i < toResolve.length; i++) {
    const id = toResolve[i];
    const meta = byId.get(id)!;
    if (i > 0) await new Promise((r) => setTimeout(r, DEEZER_PACING_MS));
    try {
      const preview = await lookupPreview({ id: meta.id, title: meta.title, artist: meta.artist, isrc: meta.isrc });
      if (!preview) {
        if (id === seedTrackId) throw new Error(`Seed track ${seedTrackId} has no Deezer match.`);
        skipped.push({ trackId: id, reason: "No Deezer match / preview" });
        continue;
      }
      previews.set(id, preview);
    } catch (err) {
      if (id === seedTrackId) throw err instanceof Error ? err : new Error(String(err));
      skipped.push({ trackId: id, reason: err instanceof Error ? err.message : "Deezer lookup failed" });
    }
  }

  // Cache-first embedding: only call the provider for tracks missing from
  // track_embeddings under this model's pinned version.
  const embeddable = candidateIds.filter((id) => previews.has(id));
  const needed = [seedTrackId, ...embeddable];
  const cached = await getCachedEmbeddings(supabase, needed, model);

  for (let i = 0; i < needed.length; i++) {
    const id = needed[i];
    if (cached.has(id)) continue;
    const preview = previews.get(id)!;
    if (i > 0) await new Promise((r) => setTimeout(r, EMBED_PACING_MS));
    try {
      const embedding = await provider.embed(preview.previewUrl);
      await saveEmbedding(supabase, {
        trackId: id,
        isrc: preview.isrc,
        previewUrl: preview.previewUrl,
        model,
        embedding,
      });
      cached.set(id, embedding);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Embedding failed";
      if (id === seedTrackId) throw new Error(`Seed embedding failed: ${reason}`);
      skipped.push({ trackId: id, reason });
    }
  }

  const seedVector = cached.get(seedTrackId);
  if (!seedVector) throw new Error(`Seed track ${seedTrackId} could not be embedded.`);

  const rankable = embeddable.filter((id) => cached.has(id));
  const ranked = await rankByCosine(supabase, seedVector, rankable, model);

  return { seedTrackId, model, ranked, skipped };
}
