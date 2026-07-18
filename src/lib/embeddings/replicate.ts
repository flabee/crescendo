import type { EmbeddingProvider } from "./types";

const PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";
const CLAP_DIMENSIONS = 512;
// Replicate resolves most predictions within this synchronous wait window;
// anything still running falls through to polling below.
const SYNC_WAIT_SECONDS = 55;
const POLL_TIMEOUT_MS = 55_000;

interface ReplicatePrediction {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  urls: { get: string };
}

function extractEmbedding(output: unknown): number[] | null {
  if (Array.isArray(output)) {
    if (typeof output[0] === "number") return output as number[];
    if (Array.isArray(output[0])) return output[0] as number[]; // batched output, one input
  }
  if (output && typeof output === "object") {
    const embedding = (output as { embedding?: unknown }).embedding;
    if (Array.isArray(embedding)) return embedding as number[];
  }
  return null;
}

/**
 * Embedding provider backed by a LAION CLAP music checkpoint running on
 * Replicate. The version hash is pinned via env (never "latest") so vectors
 * cached in track_embeddings stay comparable across requests and deploys.
 *
 * To swap in MuQ-MuLan or a self-hosted endpoint later, implement
 * EmbeddingProvider and point the factory in ./index.ts at it — nothing else
 * in the similarity pipeline knows about Replicate.
 */
export class ReplicateClapProvider implements EmbeddingProvider {
  readonly dimensions = CLAP_DIMENSIONS;
  readonly modelId: string;

  constructor(
    private readonly token: string,
    private readonly replicateVersion: string,
    modelName = "laion/clap-htsat-music",
  ) {
    this.modelId = `${modelName}@${replicateVersion}`;
  }

  async embed(previewUrl: string): Promise<number[]> {
    const create = await fetch(PREDICTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Prefer: `wait=${SYNC_WAIT_SECONDS}`,
      },
      body: JSON.stringify({
        version: this.replicateVersion,
        input: { audio: previewUrl },
      }),
    });
    if (!create.ok) {
      const body = await create.text().catch(() => "");
      throw new Error(`Replicate ${create.status}: ${body.slice(0, 300)}`);
    }
    let prediction = (await create.json()) as ReplicatePrediction;

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
      if (Date.now() > deadline) throw new Error("Replicate prediction timed out");
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await fetch(prediction.urls.get, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!poll.ok) throw new Error(`Replicate poll ${poll.status}`);
      prediction = (await poll.json()) as ReplicatePrediction;
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`);
    }

    const vector = extractEmbedding(prediction.output);
    if (!vector || vector.length === 0) throw new Error("Replicate prediction returned no embedding");
    return vector;
  }
}
