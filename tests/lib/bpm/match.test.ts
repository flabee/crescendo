import { describe, it, expect } from "vitest";
import { normalize, titleArtistConfidence } from "@/lib/bpm/match";

describe("normalize", () => {
  it("lowercases, strips punctuation and feat/remaster tags", () => {
    expect(normalize("Song (Remastered 2011) - feat. X")).toBe("song");
  });
  it("collapses whitespace", () => {
    expect(normalize("  A   B  ")).toBe("a b");
  });
  it("strips a standalone feat/featuring tag not in parens or after a dash", () => {
    expect(normalize("Song feat. X")).toBe("song");
    expect(normalize("Song featuring Someone Else")).toBe("song");
  });
  it("keeps non-Latin letters via \\p{L}", () => {
    expect(normalize("Привет")).toBe("привет");
    expect(normalize("君の名は")).toBe("君の名は");
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
  it("does not inflate to 1 when a title normalizes to empty", () => {
    // "(feat. A)" normalizes to "" — must not score as an exact match.
    expect(titleArtistConfidence("(feat. A)", "Real Artist", "", "Real Artist")).toBeLessThan(0.5);
  });
  it("scores an exact non-Latin match as 1", () => {
    expect(titleArtistConfidence("Привет", "Артист", "привет", "артист")).toBe(1);
  });
});
