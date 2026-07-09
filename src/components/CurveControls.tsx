"use client";

export function CurveControls({
  startBpm,
  endBpm,
  targetMinutes,
  onChange,
}: {
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
  onChange: (patch: { startBpm?: number; endBpm?: number; targetMinutes?: number }) => void;
}) {
  const bump = (
    key: "startBpm" | "endBpm" | "targetMinutes",
    current: number,
    delta: number,
  ) => {
    const min = key === "targetMinutes" ? 5 : 30;
    const next = Math.max(min, current + delta);
    onChange({ [key]: next });
  };

  return (
    <section className="grid grid-cols-3 gap-4">
      <div>
        <label className="metric-label mb-2 block">Start BPM</label>
        <div className="stepper">
          <button
            type="button"
            aria-label="decrease start bpm"
            className="stepbtn"
            onClick={() => bump("startBpm", startBpm, -1)}
          >
            ‹
          </button>
          <input
            type="number"
            value={startBpm}
            onChange={(e) => onChange({ startBpm: Number(e.target.value) })}
          />
          <button
            type="button"
            aria-label="increase start bpm"
            className="stepbtn"
            onClick={() => bump("startBpm", startBpm, 1)}
          >
            ›
          </button>
        </div>
      </div>
      <div>
        <label className="metric-label mb-2 block">End BPM</label>
        <div className="stepper">
          <button
            type="button"
            aria-label="decrease end bpm"
            className="stepbtn"
            onClick={() => bump("endBpm", endBpm, -1)}
          >
            ‹
          </button>
          <input
            type="number"
            value={endBpm}
            onChange={(e) => onChange({ endBpm: Number(e.target.value) })}
          />
          <button
            type="button"
            aria-label="increase end bpm"
            className="stepbtn"
            onClick={() => bump("endBpm", endBpm, 1)}
          >
            ›
          </button>
        </div>
      </div>
      <div>
        <label className="metric-label mb-2 block">Minutes</label>
        <div className="stepper">
          <button
            type="button"
            aria-label="decrease minutes"
            className="stepbtn"
            onClick={() => bump("targetMinutes", targetMinutes, -5)}
          >
            ‹
          </button>
          <input
            type="number"
            value={targetMinutes}
            onChange={(e) => onChange({ targetMinutes: Number(e.target.value) })}
          />
          <button
            type="button"
            aria-label="increase minutes"
            className="stepbtn"
            onClick={() => bump("targetMinutes", targetMinutes, 5)}
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}
