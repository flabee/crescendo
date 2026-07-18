import type { EmbeddingProvider } from "./types";
import { HuggingFaceClapProvider } from "./huggingface";

export type { EmbeddingProvider } from "./types";

let cached: EmbeddingProvider | null = null;

/**
 * Single active embedding provider. Swapping to MuQ-MuLan or a different
 * self-hosted endpoint later means adding a class that implements
 * EmbeddingProvider and returning it here — the rest of the similarity
 * pipeline is provider-agnostic.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;

  const endpointUrl = process.env.EMBEDDING_ENDPOINT_URL;
  const token = process.env.EMBEDDING_API_TOKEN;
  if (!endpointUrl) {
    throw new Error(
      "EMBEDDING_ENDPOINT_URL is not set — point it at your HF Inference Endpoint (or self-hosted equivalent).",
    );
  }
  if (!token) throw new Error("EMBEDDING_API_TOKEN is not set.");
  cached = new HuggingFaceClapProvider(endpointUrl, token);
  return cached;
}
