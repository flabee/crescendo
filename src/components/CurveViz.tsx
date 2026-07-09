"use client";

export function CurveViz({
  tracks,
  startBpm,
  endBpm,
}: {
  tracks: { id: string; bpm: number; target: number }[];
  startBpm: number;
  endBpm: number;
}) {
  const allBpms = tracks.map((t) => t.bpm);
  const lo = Math.max(0, Math.min(startBpm, endBpm, ...allBpms) - 10);
  const hi = Math.max(startBpm, endBpm, ...allBpms) + 10;
  const span = hi - lo || 1;
  const mid = Math.round((hi + lo) / 2);

  const heightPct = (bpm: number) => {
    const raw = ((bpm - lo) / span) * 100;
    return Math.min(100, Math.max(4, raw));
  };

  return (
    <div className="mb-6">
      <div className="metric-label mb-3 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-[1px]"
          style={{ background: "#41e6d6", boxShadow: "0 0 7px rgba(65,230,214,.7)" }}
        />
        BPM Curve
      </div>
      <div className="flex gap-3">
        {/* chart area */}
        <div className="relative h-40 flex-1">
          {/* dotted gridlines */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{
                top: `${(i / 3) * 100}%`,
                borderTop: "1px dotted rgba(65,230,214,.14)",
              }}
            />
          ))}
          {/* target-shape overlay — a faint cyan dotted line of the intended
              per-track targets, drawn BEHIND the amber bars so the chosen curve
              shape stays visible. Same fixed-width cells as the bars keep the
              two rows aligned. */}
          <div className="pointer-events-none absolute inset-0 flex items-end justify-start gap-[3px]">
            {tracks.map((t, i) => (
              <div
                key={`tgt-${t.id}-${i}`}
                style={{ flex: "0 1 14px", minWidth: "6px", maxWidth: "14px", height: `${heightPct(t.target)}%` }}
              >
                <span
                  className="block h-[3px] w-full rounded-full"
                  style={{ background: "#41e6d6", boxShadow: "0 0 5px rgba(65,230,214,.5)", opacity: 0.5 }}
                />
              </div>
            ))}
          </div>
          {/* bars — fixed-width, left-aligned so a single track reads as one
              slim bar (not a full-width fill); scrolls if there are many. */}
          <div className="absolute inset-0 flex items-end justify-start gap-[3px] overflow-x-auto">
            {tracks.map((t, i) => (
              <div
                key={`${t.id}-${i}`}
                title={`${t.bpm} bpm (target ${t.target})`}
                style={{
                  flex: "0 1 14px",
                  minWidth: "6px",
                  maxWidth: "14px",
                  height: `${heightPct(t.bpm)}%`,
                  background:
                    "repeating-linear-gradient(to top,#f6b41e 0 4px,transparent 4px 6px)",
                  boxShadow: "0 0 6px rgba(246,180,30,.35)",
                }}
              />
            ))}
          </div>
        </div>
        {/* right axis */}
        <div className="vfd flex w-10 flex-col justify-between text-right text-[11px] text-cyan">
          <span className="glow-c">{hi}</span>
          <span className="glow-c">{mid}</span>
          <span className="glow-c">{lo}</span>
        </div>
      </div>
    </div>
  );
}
