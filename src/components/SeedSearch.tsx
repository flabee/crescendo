"use client";
import { useEffect, useRef, useState } from "react";
import type { SeedTrack } from "@/components/SeedStudio";

export function SeedSearch({ onPick }: { onPick: (track: SeedTrack) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SeedTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
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
      } catch {
        setResults([]);
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
        placeholder="Search for a seed track…"
        className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 outline-none focus:border-neutral-600"
      />
      {searching && <p className="text-xs text-neutral-500">searching…</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
          {results.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onPick(t)}
                className="flex w-full items-baseline gap-2 px-4 py-2 text-left hover:bg-neutral-800"
              >
                <span className="font-medium">{t.title}</span>
                <span className="text-sm text-neutral-400">— {t.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
