import { describe, it, expect } from "vitest";
import { familiaritySet } from "@/lib/pool/familiarity";

describe("familiaritySet", () => {
  it("lowercases artist names and exposes membership", () => {
    const set = familiaritySet([
      { id: "1", name: "Radiohead" },
      { id: "2", name: "Boards of Canada" },
    ]);
    expect(set.has("radiohead")).toBe(true);
    expect(set.has("boards of canada")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("normalizes mixed/upper case names to lowercase", () => {
    const set = familiaritySet([
      { id: "1", name: "APHEX TWIN" },
      { id: "2", name: "FoUr TeT" },
    ]);
    expect(set.has("aphex twin")).toBe(true);
    expect(set.has("four tet")).toBe(true);
    expect(set.has("APHEX TWIN")).toBe(false);
  });
});
