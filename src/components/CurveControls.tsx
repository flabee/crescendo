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
  const field =
    "w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-lg tabular-nums outline-none focus:border-neutral-600";
  const label = "mb-1 block text-xs uppercase tracking-wide text-neutral-400";
  return (
    <section className="grid grid-cols-3 gap-3 rounded-lg border border-neutral-800 p-4">
      <div>
        <label className={label}>Start BPM</label>
        <input
          type="number"
          value={startBpm}
          onChange={(e) => onChange({ startBpm: Number(e.target.value) })}
          className={field}
        />
      </div>
      <div>
        <label className={label}>End BPM</label>
        <input
          type="number"
          value={endBpm}
          onChange={(e) => onChange({ endBpm: Number(e.target.value) })}
          className={field}
        />
      </div>
      <div>
        <label className={label}>Minutes</label>
        <input
          type="number"
          value={targetMinutes}
          onChange={(e) => onChange({ targetMinutes: Number(e.target.value) })}
          className={field}
        />
      </div>
    </section>
  );
}
