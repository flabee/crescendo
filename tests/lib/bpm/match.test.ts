import { describe, it, expect } from "vitest";
import { normalize, titleArtistConfidence } from "@/lib/bpm/match";

describe("normalize", () => {
  it("lowercases, strips punctuation and feat/remaster tags", () => {
    expect(normalize("Song (Remastered 2011) - feat. X")).toBe("song");
  });
  it("collapses whitespace", () => {
    expect(normalize("  A   B  ")).toBe("a b");
  });
});

describe("titleArtistConfidence", () => {
  it("scores exact normalized match as 1", () => {
    expect(titleArtistConfidence("Hey Jude", "The Beatles", "hey jude", "the beatles")).toBe(1);
  });
  it("scores a clear mismatch below 0.5", () => {
    expect(titleArtistConfidence("Hey Jude", "The Beatles", "Toxic", "Britney Spears")).toBeLessThan(0.5);
  });
  it("tolerates minor differences above 0.8", () => {
    expect(titleArtistConfidence("Hey Jude", "Beatles", "Hey Jude", "The Beatles")).toBeGreaterThan(0.8);
  });
});
