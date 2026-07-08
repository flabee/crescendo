export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((remastered|remaster|feat\.?|featuring)[^)]*\)/g, "")
    .replace(/-\s*(remastered|remaster|feat\.?|featuring).*/g, "")
    .replace(/\s+(feat\.?|featuring)\s+.*/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Dice coefficient on character bigrams: 0..1, order-insensitive, cheap.
function dice(a: string, b: string): number {
  // Empty normalized input carries no signal — never treat "" ≈ "" as a match.
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, countA] of A) {
    const countB = B.get(g) ?? 0;
    overlap += Math.min(countA, countB);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export function titleArtistConfidence(
  wantTitle: string,
  wantArtist: string,
  gotTitle: string,
  gotArtist: string,
): number {
  const titleScore = dice(normalize(wantTitle), normalize(gotTitle));
  const artistScore = dice(normalize(wantArtist), normalize(gotArtist));
  // Title matters more than artist string exactness.
  return Number((titleScore * 0.6 + artistScore * 0.4).toFixed(3));
}
