"use client";
import { CurvePresets, type Shape } from "@/components/CurvePresets";

export function CurveControls({
  startBpm,
  endBpm,
  targetMinutes,
  shape,
  onChange,
  onShapeChange,
}: {
  startBpm: number;
  endBpm: number;
  targetMinutes: number;
  shape: Shape;
  onChange: (patch: { startBpm?: number; endBpm?: number; targetMinutes?: number }) => void;
  onShapeChange: (s: Shape) => void;
}) {
  // "flat" holds the start BPM the whole way, so the End stepper has no effect.
  // De-emphasise it (still editable) rather than hard-disabling.
  const endIgnored = shape === "flat";
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
    <section className="space-y-4">
      <CurvePresets value={shape} onChange={onShapeChange} />
      <div className="grid grid-cols-3 gap-4">
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
      <div
        className={endIgnored ? "opacity-40 transition-opacity" : "transition-opacity"}
      >
        <label className="metric-label mb-2 block">
          End BPM{endIgnored && <span className="ml-1 normal-case text-dim">(ignored)</span>}
        </label>
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
      </div>
    </section>
  );
}
