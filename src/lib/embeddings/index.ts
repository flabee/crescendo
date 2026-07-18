import type { EmbeddingProvider } from "./types";
import { ReplicateClapProvider } from "./replicate";

export type { EmbeddingProvider } from "./types";

let cached: EmbeddingProvider | null = null;

/**
 * Single active embedding provider. Swapping to MuQ-MuLan or a self-hosted
 * endpoint later means adding a class that implements EmbeddingProvider and
 * returning it here — the rest of the similarity pipeline is provider-agnostic.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;

  const token = process.env.EMBEDDING_API_TOKEN;
  const version = process.env.EMBEDDING_MODEL_VERSION;
  if (!token) throw new Error("EMBEDDING_API_TOKEN is not set.");
  if (!version) {
    throw new Error(
      "EMBEDDING_MODEL_VERSION is not set — pin the Replicate CLAP model version hash.",
    );
  }
  cached = new ReplicateClapProvider(token, version);
  return cached;
}
