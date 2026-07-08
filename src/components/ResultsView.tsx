"use client";
import type { GenerateResult, SeedTrack } from "@/components/SeedStudio";

export function ResultsView({
  result,
  seed,
  onSave,
  saving,
  savedUrl,
}: {
  result: GenerateResult;
  seed: SeedTrack;
  onSave: () => void;
  saving: boolean;
  savedUrl: string | null;
}) {
  return (
    <section className="space-y-4">
      <p className="text-sm text-neutral-300">
        {result.tracks.length} tracks · {result.achievedMinutes} min ·{" "}
        {result.matchedSize}/{result.poolSize} pool had BPM
      </p>

      {result.fidelity.widenedCount > 0 && (
        <p className="text-xs text-neutral-500">
          curve stretched on {result.fidelity.widenedCount} tracks
        </p>
      )}

      {result.seedOutOfRange && (
        <p className="text-xs text-amber-400/80">
          seed BPM is outside your curve range — it still leads the set as track #1
        </p>
      )}

      <ol className="divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800">
        {result.tracks.map((t, i) => (
          <li
            key={`${t.id}-${i}`}
            className="flex items-baseline justify-between gap-3 px-4 py-2"
          >
            <span className="flex items-baseline gap-2">
              {i === 0 && (
                <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                  SEED · #1
                </span>
              )}
              <span>
                {i + 1}. <span className="font-medium">{t.title}</span>{" "}
                <span className="text-neutral-400">— {t.artist}</span>
              </span>
            </span>
            <span className="shrink-0 text-sm tabular-nums text-neutral-400">
              {t.bpm} bpm (→{t.target})
            </span>
          </li>
        ))}
      </ol>

      {savedUrl ? (
        <a
          href={savedUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-full bg-green-500 px-6 py-2 font-semibold text-black hover:bg-green-400"
        >
          Open in Spotify ↗
        </a>
      ) : (
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-green-500 px-6 py-2 font-semibold text-black hover:bg-green-400 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save to Spotify"}
        </button>
      )}
    </section>
  );
}
