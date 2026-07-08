"use client";
import { useState } from "react";
import { SeedSearch } from "@/components/SeedSearch";
import { CurveControls } from "@/components/CurveControls";
import { EnrichProgress } from "@/components/EnrichProgress";
import { ResultsView } from "@/components/ResultsView";

export interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  isrc?: string;
}

interface Candidate {
  id: string;
  title: string;
  artist: string;
  isrc?: string;
  durationMs: number;
}

export interface GenerateResult {
  tracks: { id: string; title: string; artist: string; bpm: number; target: number; deviation: number }[];
  achievedMinutes: number;
  poolSize: number;
  matchedSize: number;
  filteredSize: number;
  fidelity: { maxDeviation: number; avgDeviation: number; widenedCount: number };
  suggestWiden: boolean;
  seedOutOfRange: boolean;
}

type Phase = "idle" | "priming" | "pooling" | "enriching" | "generating";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error ?? message;
    } catch {
      // ignore parse error, keep statusText
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function SeedStudio() {
  const [seed, setSeed] = useState<SeedTrack | null>(null);
  const [seedBpm, setSeedBpm] = useState<number | null>(null);
  const [startBpm, setStartBpm] = useState(100);
  const [endBpm, setEndBpm] = useState(128);
  const [targetMinutes, setTargetMinutes] = useState(45);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, matched: 0 });
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function handlePick(track: SeedTrack) {
    setSeed(track);
    setSeedBpm(null);
    setResult(null);
    setSavedUrl(null);
    setError(null);
    setPhase("priming");
    try {
      const data = await postJson<{
        matched: { trackId: string; bpm: number }[];
        unmatched: string[];
      }>("/api/enrich", {
        tracks: [{ id: track.id, title: track.title, artist: track.artist, isrc: track.isrc }],
      });
      const bpm = data.matched[0]?.bpm;
      if (typeof bpm === "number") {
        setSeedBpm(bpm);
        setStartBpm(bpm);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  }

  async function handleGenerate() {
    if (!seed) return;
    setError(null);
    setResult(null);
    setSavedUrl(null);

    async function runPool(hops: number): Promise<GenerateResult> {
      setPhase("pooling");
      const pool = await postJson<{ candidates: Candidate[]; familiar: string[] }>(
        "/api/seed/pool",
        { seedArtist: seed!.artist, hops },
      );

      setPhase("enriching");
      const chunks = chunk(pool.candidates, 50);
      const total = pool.candidates.length;
      let done = 0;
      let matched = 0;
      setProgress({ done: 0, total, matched: 0 });
      for (const c of chunks) {
        const data = await postJson<{ matched: unknown[]; unmatched: string[] }>("/api/enrich", {
          tracks: c.map((x) => ({ id: x.id, title: x.title, artist: x.artist, isrc: x.isrc })),
        });
        done += c.length;
        matched += data.matched.length;
        setProgress({ done, total, matched });
      }

      setPhase("generating");
      return postJson<GenerateResult>("/api/generate", {
        seed: {
          id: seed!.id,
          title: seed!.title,
          artist: seed!.artist,
          durationMs: seed!.durationMs,
          isrc: seed!.isrc,
        },
        candidates: pool.candidates,
        startBpm,
        endBpm,
        targetMinutes,
        familiar: pool.familiar,
      });
    }

    try {
      let res = await runPool(1);
      if (res.suggestWiden) {
        res = await runPool(2);
      }
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase("idle");
    }
  }

  async function handleSave() {
    if (!seed || !result) return;
    setSaving(true);
    setError(null);
    try {
      const data = await postJson<{ url: string }>("/api/save", {
        name: "Crescendo · " + seed.title,
        trackIds: result.tracks.map((t) => t.id),
        params: { startBpm, endBpm, targetMinutes, seedTitle: seed.title },
        fidelity: result.fidelity,
      });
      setSavedUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {!seed ? (
        <SeedSearch onPick={handlePick} />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
          <div>
            <p className="font-medium">{seed.title}</p>
            <p className="text-sm text-neutral-400">
              {seed.artist}
              {phase === "priming"
                ? " · reading BPM…"
                : seedBpm !== null
                  ? ` · ${seedBpm} bpm`
                  : " · BPM unknown"}
            </p>
          </div>
          <button
            onClick={() => {
              setSeed(null);
              setSeedBpm(null);
              setResult(null);
              setSavedUrl(null);
              setError(null);
            }}
            className="text-sm text-neutral-400 hover:text-white"
          >
            change
          </button>
        </div>
      )}

      <CurveControls
        startBpm={startBpm}
        endBpm={endBpm}
        targetMinutes={targetMinutes}
        onChange={(patch) => {
          if (patch.startBpm !== undefined) setStartBpm(patch.startBpm);
          if (patch.endBpm !== undefined) setEndBpm(patch.endBpm);
          if (patch.targetMinutes !== undefined) setTargetMinutes(patch.targetMinutes);
        }}
      />

      <button
        onClick={handleGenerate}
        disabled={!seed || busy}
        className="w-full rounded-full bg-green-500 px-6 py-3 font-semibold text-black hover:bg-green-400 disabled:opacity-50"
      >
        {phase === "pooling"
          ? "Building pool…"
          : phase === "enriching"
            ? "Enriching…"
            : phase === "generating"
              ? "Generating…"
              : "Generate"}
      </button>

      {phase === "enriching" && (
        <EnrichProgress done={progress.done} total={progress.total} matched={progress.matched} />
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && seed && (
        <ResultsView
          result={result}
          seed={seed}
          onSave={handleSave}
          saving={saving}
          savedUrl={savedUrl}
        />
      )}
    </div>
  );
}
