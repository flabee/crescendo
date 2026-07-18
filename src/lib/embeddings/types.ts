/**
 * Audio-embedding provider. `modelId` is the exact pinned checkpoint+version
 * string (e.g. "laion/clap-htsat-music@<replicate-version-hash>") stored in
 * track_embeddings.model — it must change whenever the underlying checkpoint
 * changes so cached vectors are never compared across incompatible models.
 */
export interface EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  embed(previewUrl: string): Promise<number[]>;
}
