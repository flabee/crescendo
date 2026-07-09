"use client";
import { useRef, useState } from "react";
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
  // Accumulates BPM (Spotify trackId -> bpm) from every enrich response — the
  // seed-prime AND every candidate chunk — so generate can carry it forward to
  // the server, which is stateless across requests on serverless.
  const bpmMapRef = useRef<Record<string, number>>({});

  const busy = phase !== "idle";

  async function handlePick(track: SeedTrack) {
    setSeed(track);
    setSeedBpm(null);
    setResult(null);
    setError(null);
    setPhase("priming");
    // Fresh seed → start a fresh BPM map.
    bpmMapRef.current = {};
    try {
      const data = await postJson<{
        matched: { trackId: string; bpm: number }[];
        unmatched: string[];
      }>("/api/enrich", {
        tracks: [{ id: track.id, title: track.title, artist: track.artist, isrc: track.isrc }],
      });
      // Record the primed seed BPM so generate can carry it forward without
      // relying on the shared store (stateless on serverless).
      for (const m of data.matched) bpmMapRef.current[m.trackId] = m.bpm;
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

    async function runPool(hops: number): Promise<GenerateResult> {
      setPhase("pooling");
      const pool = await postJson<{ candidates: Candidate[]; familiar: string[] }>(
        "/api/seed/pool",
        { seedArtist: seed!.artist, hops },
      );

      // Cap the pool client-side: generate accepts at most 500 candidates, and
      // this also bounds the enrich work. A widened graph can exceed 500.
      const candidates = pool.candidates.slice(0, 500);

      setPhase("enriching");
      const chunks = chunk(candidates, 50);
      const total = candidates.length;
      let done = 0;
      let matched = 0;
      setProgress({ done: 0, total, matched: 0 });
      for (const c of chunks) {
        const data = await postJson<{
          matched: { trackId: string; bpm: number }[];
          unmatched: string[];
        }>("/api/enrich", {
          tracks: c.map((x) => ({ id: x.id, title: x.title, artist: x.artist, isrc: x.isrc })),
        });
        // Carry each matched BPM forward so generate never depends on shared
        // server state.
        for (const m of data.matched) bpmMapRef.current[m.trackId] = m.bpm;
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
        candidates,
        startBpm,
        endBpm,
        targetMinutes,
        familiar: pool.familiar,
        bpm: bpmMapRef.current,
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

  // Clear the current result so the user can re-run (with the same or a tweaked
  // BPM/minutes) without being stuck on the finished set. Keeps the seed and its
  // primed BPM map intact so Generate stays immediately usable.
  function handleNewRun() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-6">
      {!seed ? (
        <SeedSearch onPick={handlePick} />
      ) : (
        <div className="panel flex items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="metric-label mb-2 flex items-center gap-2 text-cyanlabel">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{
                  background: "#41e6d6",
                  boxShadow: "0 0 7px rgba(65,230,214,.7)",
                }}
              />
              Now Tuned
            </div>
            <p className="truncate text-lg text-cyanlabel">{seed.title}</p>
            <p className="text-xs text-dim">{seed.artist}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="vfd glow-c text-[40px] leading-none text-cyan">
              {seedBpm !== null ? seedBpm : "--"}
              <span className="ml-1 align-middle text-[13px]">BPM</span>
            </div>
            <button
              onClick={() => {
                setSeed(null);
                setSeedBpm(null);
                setResult(null);
                setError(null);
              }}
              disabled={busy}
              className="chip !py-1.5 !text-[10px] tracking-[.2em] text-cyan hover:border-[rgba(65,230,214,.5)] disabled:opacity-45"
              style={{ color: "#41e6d6", borderColor: "rgba(65,230,214,.4)" }}
            >
              ◀ Change Seed
            </button>
          </div>
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
        className="btn-amber flex w-full items-center justify-center gap-3 px-6 py-3.5 text-sm"
      >
        <span className="flex items-end gap-[3px]" aria-hidden="true">
          <span className="block w-[3px] bg-amber" style={{ height: "8px", boxShadow: "0 0 6px rgba(246,180,30,.6)" }} />
          <span className="block w-[3px] bg-amber" style={{ height: "14px", boxShadow: "0 0 6px rgba(246,180,30,.6)" }} />
          <span className="block w-[3px] bg-amber" style={{ height: "6px", boxShadow: "0 0 6px rgba(246,180,30,.6)" }} />
          <span className="block w-[3px] bg-amber" style={{ height: "11px", boxShadow: "0 0 6px rgba(246,180,30,.6)" }} />
        </span>
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
        <div
          className="glow-r rounded-lg px-4 py-3 text-xs uppercase tracking-[.14em] text-red"
          style={{
            border: "1px solid rgba(255,58,94,.4)",
            background: "rgba(255,58,94,.06)",
          }}
        >
          {error}
        </div>
      )}

      {result && seed && (
        <ResultsView
          result={result}
          seed={seed}
          onNewRun={handleNewRun}
          busy={busy}
        />
      )}
    </div>
  );
}
