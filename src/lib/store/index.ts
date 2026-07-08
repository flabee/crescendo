import { loadSeed } from "./seed";
import { MemoryStore } from "./memory-store";
import { KvStore } from "./kv-store";
import type { KvClient } from "./kv-store";
import type { Store } from "./types";

// Cache the promise (not the resolved Store) so concurrent first-callers share
// one instance instead of racing to build separate ones.
let cached: Promise<Store> | null = null;

async function build(): Promise<Store> {
  const seed = loadSeed();
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    return new KvStore(kv as unknown as KvClient, seed);
  }
  return new MemoryStore(seed);
}

export function getStore(): Promise<Store> {
  if (!cached) cached = build();
  return cached;
}
