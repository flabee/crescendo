"use client";

export type Shape = "ramp" | "ease" | "flat" | "dip";

// Tiny inline sparkline heights (percent) evoking each curve shape.
const SPARKS: Record<Shape, { label: string; bars: number[] }> = {
  ramp: { label: "Ramp", bars: [20, 40, 60, 80, 100] },
  ease: { label: "Ease", bars: [20, 30, 55, 85, 95] },
  flat: { label: "Flat", bars: [60, 60, 60, 60, 60] },
  dip: { label: "Dip", bars: [90, 55, 30, 55, 90] },
};

const ORDER: Shape[] = ["ramp", "ease", "flat", "dip"];

function Spark({ bars, active }: { bars: number[]; active: boolean }) {
  const color = active ? "#f6b41e" : "#64bdb4";
  const glow = active ? "0 0 6px rgba(246,180,30,.55)" : "none";
  return (
    <span
      className="flex h-4 items-end justify-center gap-[2px]"
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <i
          key={i}
          className="block w-[3px] rounded-[1px]"
          style={{ height: `${h}%`, background: color, boxShadow: glow }}
        />
      ))}
    </span>
  );
}

export function CurvePresets({
  value,
  onChange,
}: {
  value: Shape;
  onChange: (s: Shape) => void;
}) {
  return (
    <div>
      <label className="metric-label mb-2 block">Curve Shape</label>
      <div className="grid grid-cols-4 gap-2">
        {ORDER.map((s) => {
          const active = value === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(s)}
              className={`chip flex flex-col items-center gap-1.5 !px-2 !py-2.5 ${
                active ? "on glow-a" : "hover:border-[rgba(65,230,214,.35)]"
              }`}
            >
              <Spark bars={SPARKS[s].bars} active={active} />
              <span className="text-[10px] tracking-[.2em]">
                {SPARKS[s].label.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
