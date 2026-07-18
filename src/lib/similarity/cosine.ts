/**
 * Cosine similarity between two equal-length vectors, in [-1, 1] (1 = identical
 * direction). Mirrors the SQL used by the `match_track_embeddings` migration:
 * `1 - (embedding <=> query_embedding)`, pgvector's cosine-distance operator.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredCandidate<T> {
  item: T;
  score: number;
}

/** Ranks candidates by cosine similarity to `seedVector`, highest score first. */
export function rankBySimilarity<T>(
  seedVector: number[],
  candidates: { item: T; vector: number[] }[],
): ScoredCandidate<T>[] {
  return candidates
    .map(({ item, vector }) => ({ item, score: cosineSimilarity(seedVector, vector) }))
    .sort((a, b) => b.score - a.score);
}
