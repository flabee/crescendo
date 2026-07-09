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
    <div className="space-y-2">
      <div className="hairline h-2 w-full overflow-hidden rounded-full bg-transparent">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: "#f6b41e",
            boxShadow: "0 0 10px rgba(246,180,30,.5)",
          }}
        />
      </div>
      <p className="text-[11px] uppercase tracking-[.2em] text-dim">
        Enriching BPM: <span className="vfd glow-c text-cyan">{done}</span>/
        <span className="vfd glow-c text-cyan">{total}</span> —{" "}
        <span className="vfd glow-c text-cyan">{matched}</span> matched
      </p>
    </div>
  );
}
