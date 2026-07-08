"use client";

export function EnrichProgress({
  done,
  total,
  matched,
}: {
  done: number;
  total: number;
  matched: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full bg-green-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-neutral-400">
        Enriching BPM: {done}/{total} — {matched} matched
      </p>
    </div>
  );
}
