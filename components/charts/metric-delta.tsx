import { cn } from '@/lib/utils'

/** Canonical comparison-delta line. `invertDelta` makes a negative delta "good"
 *  (green) — e.g. bounce rate, CPA. `label` is the trailing copy ("vs prior period"). */
export function MetricDelta({
  delta,
  label,
  invertDelta = false,
  className,
}: {
  delta: number
  label: string
  invertDelta?: boolean
  className?: string
}) {
  const positiveIsGood = !invertDelta
  const color =
    delta === 0
      ? 'text-text-muted'
      : (delta > 0) === positiveIsGood
        ? 'text-brand-green'
        : 'text-[#FF4444]'
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '—'
  return (
    <p className={cn('text-sm font-bold', color, className)}>
      {arrow} {`${Math.abs(delta).toFixed(1)}%`} {label}
    </p>
  )
}
