import { cn } from '@/lib/utils'
import { roundDelta } from '@/lib/delta-rounding'
import { HoverHint } from './hover-hint'

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
  /** When true and no delta is available, render a greyed "— {deltaLabel}" placeholder instead
   *  of nothing — signalling "comparison not possible" (distinct from a real 0.0% change). Opt-in
   *  so cards on sections without a comparison are unaffected. */
  comparisonExpected?: boolean
  /** Secondary line shown below the delta, e.g. "2,483 in 2025" or a short caveat. */
  subValue?: string
  /** Show the change as the outline clients' Organic Social tiles do (roundDelta): whole numbers from 1%, one
   *  decimal under 1%. Absent: one decimal. */
  wholeDelta?: boolean
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
  comparisonExpected = false,
  subValue,
  wholeDelta,
}: KpiCardProps) {
  // The value shown drives the arrow, the colour and the text, so they always agree.
  const shown = delta === undefined ? undefined : wholeDelta ? roundDelta(delta) : delta
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">

      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
          {title}
        </p>
        {tooltip && <HoverHint text={tooltip} />}
      </div>

      <p className="mt-2 text-3xl font-extrabold text-white">
        {prefix}
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix}
      </p>

      {shown !== undefined ? (
        <p
          className={cn(
            'mt-1 text-sm font-bold',
            invertDelta
              ? shown < 0 ? 'text-brand-green' : shown > 0 ? 'text-[#FF4444]' : 'text-text-muted'
              : shown > 0 ? 'text-brand-green' : shown < 0 ? 'text-[#FF4444]' : 'text-text-muted'
          )}
        >
          {shown > 0 ? '↑' : shown < 0 ? '↓' : '—'}{' '}
          {Math.abs(shown).toFixed(wholeDelta && (shown === 0 || Math.abs(shown) >= 1) ? 0 : 1)}% {deltaLabel}
        </p>
      ) : comparisonExpected ? (
        // No prior value to compare against — show a greyed placeholder (no % so it can't be
        // mistaken for a real 0.0% change) instead of an empty gap.
        <p className="mt-1 text-sm font-bold text-text-muted">— {deltaLabel}</p>
      ) : null}

      {subValue && (
        <p className="mt-0.5 text-xs text-text-muted">{subValue}</p>
      )}
    </div>
  )
}
