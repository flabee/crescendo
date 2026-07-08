import { loadSeed } from "./seed";
import { MemoryStore } from "./memory-store";
import { KvStore } from "./kv-store";
import type { Store } from "./types";

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  const seed = loadSeed();
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import("@vercel/kv");
    cached = new KvStore(kv as never, seed);
  } else {
    cached = new MemoryStore(seed);
  }
  return cached;
}
