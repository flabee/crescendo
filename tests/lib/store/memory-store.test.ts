import { describe, it, expect } from "vitest";
import { MemoryStore } from "@/lib/store/memory-store";

// Shared Store semantics are exercised in contract.test.ts; this covers the
// memory-specific fact: it is a non-persistent store.
describe("MemoryStore", () => {
  it("is not persistent", () => {
    expect(new MemoryStore([]).persistent).toBe(false);
  });
});
