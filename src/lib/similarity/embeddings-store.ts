import type { SupabaseClient } from "@supabase/supabase-js";

export interface TrackEmbeddingRow {
  trackId: string;
  isrc?: string;
  previewUrl: string;
  model: string;
  embedding: number[];
}

export interface RankedRow {
  trackId: string;
  score: number;
}

/** pgvector columns come back from PostgREST as a JSON-ish string; normalize to number[]. */
function parseVector(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") return JSON.parse(raw) as number[];
  throw new Error("Unexpected embedding format from Supabase");
}

/** Cache-first lookup: which of `trackIds` already have an embedding for `model`. */
export async function getCachedEmbeddings(
  supabase: SupabaseClient,
  trackIds: string[],
  model: string,
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (trackIds.length === 0) return map;

  const { data, error } = await supabase
    .from("track_embeddings")
    .select("track_id, embedding")
    .eq("model", model)
    .in("track_id", trackIds);
  if (error) throw new Error(`Supabase select track_embeddings failed: ${error.message}`);

  for (const row of data ?? []) {
    map.set(row.track_id as string, parseVector(row.embedding));
  }
  return map;
}

export async function saveEmbedding(supabase: SupabaseClient, row: TrackEmbeddingRow): Promise<void> {
  const { error } = await supabase.from("track_embeddings").upsert(
    {
      track_id: row.trackId,
      isrc: row.isrc ?? null,
      preview_url: row.previewUrl,
      model: row.model,
      embedding: row.embedding,
    },
    { onConflict: "track_id,model" },
  );
  if (error) throw new Error(`Supabase upsert track_embeddings failed: ${error.message}`);
}

/**
 * Ranks `candidateTrackIds` by cosine similarity to `seedVector`, scoped to one
 * model. Delegates the actual distance computation to pgvector's `<=>` cosine
 * operator (see the `match_track_embeddings` SQL function) so Postgres does
 * the ranking, index-accelerated, instead of pulling every vector into Node.
 */
export async function rankByCosine(
  supabase: SupabaseClient,
  seedVector: number[],
  candidateTrackIds: string[],
  model: string,
): Promise<RankedRow[]> {
  if (candidateTrackIds.length === 0) return [];

  const { data, error } = await supabase.rpc("match_track_embeddings", {
    query_embedding: seedVector,
    match_model: model,
    candidate_ids: candidateTrackIds,
  });
  if (error) throw new Error(`Supabase rpc match_track_embeddings failed: ${error.message}`);

  return ((data ?? []) as { track_id: string; similarity: number }[]).map((r) => ({
    trackId: r.track_id,
    score: r.similarity,
  }));
}
