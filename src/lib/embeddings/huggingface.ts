import type { EmbeddingProvider } from "./types";

const CLAP_DIMENSIONS = 512;
const MODEL_NAME = "laion/larger_clap_music";
// Exact commit SHA on the laion/larger_clap_music HF repo's main branch.
// Pinned (not env-configurable) so the cache key below only changes on a
// deliberate code change, never silently on an upstream repo update.
//
// ⚠️ Sourced from a web search summary, not a direct fetch of the HF repo —
// this sandbox's egress policy blocks huggingface.co outright. Verify this
// hash against https://huggingface.co/laion/larger_clap_music/commits/main
// before deploying the Inference Endpoint pinned to it.
const MODEL_REVISION = "a0b4534a14f58e20944452dff00a22a06ce629d1";

interface EmbeddingResponse {
  embedding?: unknown;
  error?: string;
}

function extractEmbedding(body: unknown): number[] | null {
  if (Array.isArray(body)) {
    if (typeof body[0] === "number") return body as number[];
    if (Array.isArray(body[0]) && typeof body[0][0] === "number") return body[0] as number[]; // batched output
  }
  if (body && typeof body === "object") {
    const embedding = (body as EmbeddingResponse).embedding;
    if (Array.isArray(embedding)) return embedding as number[];
  }
  return null;
}

/**
 * Embedding provider backed by a LAION CLAP music checkpoint (laion/larger_clap_music,
 * pinned to MODEL_REVISION) deployed behind an HTTP endpoint — a Hugging Face
 * Inference Endpoint by default, or any self-hosted service (e.g. Modal) that
 * accepts the same request/response shape. Configured via EMBEDDING_ENDPOINT_URL
 * + EMBEDDING_API_TOKEN.
 *
 * Request/response contract expected of the endpoint:
 *   POST <EMBEDDING_ENDPOINT_URL>  { "inputs": "<preview mp3 url>" }
 *   -> 200 { "embedding": number[512] }  (or a bare number[512] array)
 *
 * To swap in MuQ-MuLan or a different self-hosted endpoint later, implement
 * EmbeddingProvider and point the factory in ./index.ts at it — nothing else
 * in the similarity pipeline knows about this HTTP contract.
 */
export class HuggingFaceClapProvider implements EmbeddingProvider {
  readonly dimensions = CLAP_DIMENSIONS;
  readonly modelId = `${MODEL_NAME}@${MODEL_REVISION}`;

  constructor(
    private readonly endpointUrl: string,
    private readonly token: string,
  ) {}

  async embed(previewUrl: string): Promise<number[]> {
    const res = await fetch(this.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: previewUrl }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HF embedding endpoint ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as unknown;
    const vector = extractEmbedding(json);
    if (!vector || vector.length === 0) {
      throw new Error("HF embedding endpoint returned no embedding");
    }
    return vector;
  }
}
