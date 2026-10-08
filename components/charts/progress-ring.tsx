// A progress ring (the KPI Check-In, 10/6 calls; look: S6b): a 270 degree track, the filled share of it, the value in
// the middle and "Target: X" under it. Plain SVG, server-safe, prints in the PDF. No library needed for a static arc.
const R = 44
const ARC = 0.75 * 2 * Math.PI * R // the 270 degree track
const num = (n: number) => n.toLocaleString('en-US')

export function ringRatio(value: number, target: number): number {
  if (!(target > 0)) return 0
  return Math.max(0, Math.min(1, value / target))
}

export function ProgressRing({ label, value, target, color = '#60FDFF' }: { label: string; value: number; target: number; color?: string }) {
  const ratio = ringRatio(value, target)
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <p className="text-center text-xs font-extrabold uppercase tracking-widest text-text-muted">{label}</p>
      {/* The ring fills its column, 128 to 176 px, and its two lines are sized from the ring's own width (cqw), so they
          always fit inside the hole: a fixed 128 px ring with fixed text let "858,907" and "Target: 1,000,000" spill
          over the arc (K1). The 128 px floor keeps a page squeezed by a sidebar no worse than before. */}
      <div className="@container relative aspect-square w-full min-w-32 max-w-44">
        <svg viewBox="0 0 120 120" className="h-full w-full" role="img" aria-label={`${label}: ${num(value)} of ${num(target)}`}>
          <g transform="rotate(135 60 60)">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${ARC} ${2 * Math.PI * R}`} />
            {/* No value arc at zero: a zero-length dash with round caps renders as a dot, which reads as progress. */}
            {ratio > 0 && (
              <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${ARC * ratio} ${2 * Math.PI * R}`} data-ratio={ratio.toFixed(3)} />
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[min(1.25rem,10cqw)] font-extrabold text-white">{num(value)}</span>
          <span className="text-[min(12px,7cqw)] text-text-muted">Target: {num(target)}</span>
        </div>
      </div>
    </div>
  )
}
