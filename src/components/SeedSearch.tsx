"use client";
import { useEffect, useRef, useState } from "react";
import type { SeedTrack } from "@/components/SeedStudio";

export function SeedSearch({ onPick }: { onPick: (track: SeedTrack) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SeedTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      setError(null);
      setSearched(false);
      return;
    }
    setSearching(true);
    setError(null);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/seed/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: query }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        setResults((data.tracks ?? []) as SeedTrack[]);
        setSearched(true);
      } catch (e) {
        setResults([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="SEARCH FOR A SEED TRACK…"
        className="hairline w-full rounded-lg bg-transparent px-4 py-3 text-sm uppercase tracking-[.16em] text-cyan outline-none placeholder:text-dim focus:border-[rgba(65,230,214,.4)]"
      />
      {searching && (
        <p className="text-[11px] uppercase tracking-[.22em] text-dim">
          searching…
        </p>
      )}
      {error && (
        <p className="rounded border border-red-900 bg-red-950/50 px-3 py-2 text-[11px] uppercase tracking-[.18em] text-red-300">
          search failed: {error}
        </p>
      )}
      {!searching && !error && searched && results.length === 0 && (
        <p className="text-[11px] uppercase tracking-[.22em] text-dim">
          no matches
        </p>
      )}
      {results.length > 0 && (
        <ul className="hairline divide-y divide-[rgba(65,230,214,.1)] overflow-hidden rounded-lg">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onPick(t)}
                className="flex w-full items-baseline gap-2 px-4 py-3 text-left hover:bg-[rgba(65,230,214,.05)]"
              >
                <span className="text-sm font-medium text-cyanlabel">{t.title}</span>
                <span className="text-xs text-dim">— {t.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
