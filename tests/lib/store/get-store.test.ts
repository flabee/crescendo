import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Stub @vercel/kv so the KV branch never touches the real package/connection.
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(),
    set: vi.fn(),
    mget: vi.fn(),
    lpush: vi.fn(),
    lrange: vi.fn(),
  },
}));

// getStore() memoizes at module level, so each case resets the module registry
// and imports a fresh copy to avoid the cache leaking between cases.
describe("getStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a non-persistent MemoryStore when no KV env vars are set", async () => {
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    const { getStore } = await import("@/lib/store");
    const store = await getStore();
    expect(store.persistent).toBe(false);
    expect(store.constructor.name).toBe("MemoryStore");
  });

  it("returns a persistent KvStore when both KV env vars are set", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.kv");
    vi.stubEnv("KV_REST_API_TOKEN", "token");
    const { getStore } = await import("@/lib/store");
    const store = await getStore();
    expect(store.persistent).toBe(true);
    expect(store.constructor.name).toBe("KvStore");
  });

  it("returns a MemoryStore when only one KV env var is set (gate requires both)", async () => {
    vi.stubEnv("KV_REST_API_URL", "https://example.kv");
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    const { getStore } = await import("@/lib/store");
    const store = await getStore();
    expect(store.persistent).toBe(false);
    expect(store.constructor.name).toBe("MemoryStore");
  });

  it("memoizes: concurrent first-callers share one instance", async () => {
    vi.stubEnv("KV_REST_API_URL", undefined);
    vi.stubEnv("KV_REST_API_TOKEN", undefined);
    const { getStore } = await import("@/lib/store");
    const [a, b] = await Promise.all([getStore(), getStore()]);
    expect(a).toBe(b);
  });
});
