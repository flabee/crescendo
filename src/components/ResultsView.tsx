"use client";
import type { GenerateResult, SeedTrack } from "@/components/SeedStudio";
import { CurveViz } from "@/components/CurveViz";
import { Player } from "@/components/Player";

export function ResultsView({
  result,
  seed,
  graphSize,
  onNewRun,
  busy,
}: {
  result: GenerateResult;
  seed: SeedTrack;
  graphSize?: number;
  onNewRun: () => void;
  busy: boolean;
}) {
  // Derive the curve endpoints from the real per-track targets so CurveViz can
  // scale its axis without changing this component's prop contract.
  const curveStart = result.tracks[0]?.target ?? 0;
  const curveEnd = result.tracks[result.tracks.length - 1]?.target ?? 0;

  return (
    <section className="panel space-y-5 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="metric-label">Result</div>
        <button
          onClick={onNewRun}
          disabled={busy}
          className="chip !py-1.5 !text-[10px] tracking-[.2em] hover:border-[rgba(65,230,214,.5)] disabled:opacity-45"
          style={{ color: "#41e6d6", borderColor: "rgba(65,230,214,.4)" }}
        >
          ↻ New
        </button>
      </div>

      {/* Plain-language pool diagnostic — makes an empty/thin pool's cause
          visible without opening DevTools. */}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm tracking-[.1em]">
        <span className="text-[11px] uppercase tracking-[.2em] text-cyanlabel">Pool</span>
        <span>
          <span className="vfd glow-c text-cyan">{graphSize ?? "?"}</span>{" "}
          <span className="text-xs text-dim">artists</span>
        </span>
        <span className="text-dim">·</span>
        <span>
          <span className="vfd glow-c text-cyan">{result.poolSize}</span>{" "}
          <span className="text-xs text-dim">tracks</span>
        </span>
        <span className="text-dim">·</span>
        <span>
          <span className="vfd glow-c text-cyan">{result.matchedSize}</span>{" "}
          <span className="text-xs text-dim">with BPM</span>
        </span>
      </p>

      <CurveViz
        tracks={result.tracks.map((t) => ({ id: t.id, bpm: t.bpm, target: t.target }))}
        startBpm={curveStart}
        endBpm={curveEnd}
      />

      <p className="text-[11px] uppercase tracking-[.18em] text-dim">
        <span className="vfd glow-c text-cyan">{result.tracks.length}</span> tracks ·{" "}
        <span className="vfd glow-c text-cyan">{result.achievedMinutes}</span> min ·{" "}
        <span className="vfd glow-c text-cyan">{result.matchedSize}</span>/
        <span className="vfd glow-c text-cyan">{result.poolSize}</span> pool had BPM
      </p>

      {result.fidelity.widenedCount > 0 && (
        <p className="text-[11px] uppercase tracking-[.16em] text-amber glow-a">
          curve stretched on {result.fidelity.widenedCount} tracks
        </p>
      )}

      {result.seedOutOfRange && (
        <p className="text-[11px] uppercase tracking-[.16em] text-amber glow-a">
          seed BPM is outside your curve range — it still leads the set as track #1
        </p>
      )}

      <ol className="hairline divide-y divide-[rgba(65,230,214,.1)] overflow-hidden rounded-lg">
        {result.tracks.map((t, i) => (
          <li
            key={`${t.id}-${i}`}
            className="flex items-baseline justify-between gap-3 px-4 py-2.5"
          >
            <span className="flex items-baseline gap-3">
              <span className="vfd glow-c shrink-0 text-cyan">
                {String(i + 1).padStart(2, "0")}
              </span>
              {i === 0 && (
                <span className="chip on shrink-0 !px-2 !py-0.5 !text-[10px]">
                  SEED
                </span>
              )}
              <span>
                <span className="text-sm font-medium text-cyanlabel">{t.title}</span>{" "}
                <span className="text-xs text-dim">— {t.artist}</span>
              </span>
            </span>
            <span className="shrink-0 text-xs tracking-[.12em] text-dim">
              <span className="vfd glow-a text-amber">{t.bpm}</span> (→{t.target})
            </span>
          </li>
        ))}
      </ol>

      <Player tracks={result.tracks.map((t) => ({ title: t.title, artist: t.artist, isrc: t.isrc }))} />
    </section>
  );
}
