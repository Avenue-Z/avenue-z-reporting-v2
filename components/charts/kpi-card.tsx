import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: string
  value: string | number
  delta?: number
  /** When true, a negative delta is displayed green (lower = better, e.g. bounce rate) */
  invertDelta?: boolean
  prefix?: string
  suffix?: string
  tooltip?: string
  /** Label shown after the delta %. Defaults to "vs prior period". */
  deltaLabel?: string
  /** Secondary line shown below the delta, e.g. "2,483 in 2025". */
  subValue?: string
}

export function KpiCard({
  title,
  value,
  delta,
  invertDelta = false,
  prefix,
  suffix,
  tooltip,
  deltaLabel = 'vs prior period',
  subValue,
}: KpiCardProps) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">

      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
          {title}
        </p>
        {tooltip && (
          <div className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
              ?
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {tooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-3xl font-extrabold text-white">
        {prefix}
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix}
      </p>

      {delta !== undefined && (
        <p
          className={cn(
            'mt-1 text-sm font-bold',
            invertDelta
              ? delta < 0 ? 'text-brand-green' : delta > 0 ? 'text-[#FF4444]' : 'text-text-muted'
              : delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-[#FF4444]' : 'text-text-muted'
          )}
        >
          {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'}{' '}
          {Math.abs(delta).toFixed(1)}% {deltaLabel}
        </p>
      )}

      {subValue && (
        <p className="mt-0.5 text-xs text-text-muted">{subValue}</p>
      )}
    </div>
  )
}
