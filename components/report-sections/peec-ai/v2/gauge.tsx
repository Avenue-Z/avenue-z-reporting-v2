import { MODEL_COLORS, MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'
import type { ModelMetricV2 } from '@/lib/aeo/v2/types'
import { deltaTone, formatDelta } from './delta'
import { TONE_CLASS } from './delta-columns'
import { cn } from '@/lib/utils'

const CX = 60
const CY = 60
const R = 50

/** Needle angle in degrees: -90 at 0%, +90 at 100%. The value is clamped for drawing only. */
export function gaugeArc(value: number | null): { angle: number; filled: boolean } {
  if (value == null || !Number.isFinite(value)) return { angle: -90, filled: false }
  const clamped = Math.min(100, Math.max(0, value))
  return { angle: -90 + (clamped / 100) * 180, filled: true }
}

function point(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180
  return { x: CX + radius * Math.sin(rad), y: CY - radius * Math.cos(rad) }
}

const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? '–' : `${v.toFixed(1)}%`)

export function ModelGauge({
  model,
  metric,
  metricLabel,
  showDeltas,
  compareSuffix,
}: {
  model: AEOModel
  metric: ModelMetricV2
  metricLabel: string
  showDeltas: boolean
  compareSuffix: string
}) {
  const label = MODEL_DISPLAY_LABELS[model]
  const color = MODEL_COLORS[model]
  const { angle, filled } = gaugeArc(metric.you)
  const start = point(-90, R)
  const end = point(angle, R)
  const full = point(90, R)
  const track = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${full.x} ${full.y}`
  const fill = `M ${start.x} ${start.y} A ${R} ${R} 0 0 1 ${end.x} ${end.y}`
  const tick = metric.competitorAvg == null ? null : gaugeArc(metric.competitorAvg)
  const tickIn = tick ? point(tick.angle, R - 9) : null
  const tickOut = tick ? point(tick.angle, R + 9) : null

  const change = (() => {
    if (!showDeltas) return null
    if (metric.you == null || metric.youPrior == null) {
      return <span className={TONE_CLASS.neutral}>No comparison data</span>
    }
    const diff = metric.you - metric.youPrior
    const tone = deltaTone(diff, 'higher', 'pts')
    return <span className={cn('tabular-nums', TONE_CLASS[tone])}>{`${formatDelta(diff, 'pts')} ${compareSuffix}`}</span>
  })()

  return (
    <div data-export-block className="flex flex-col items-center rounded-lg bg-bg-surface p-4">
      <svg
        viewBox="0 0 120 70"
        role="img"
        aria-label={`${label}: ${metricLabel} ${pct(metric.you)}`}
        className="w-full max-w-[220px]"
      >
        <path d={track} fill="none" stroke="#3a3a3a" strokeWidth={10} strokeLinecap="round" />
        {filled && angle > -90 && (
          <path d={fill} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
        )}
        {tickIn && tickOut && (
          <line data-tick x1={tickIn.x} y1={tickIn.y} x2={tickOut.x} y2={tickOut.y} stroke="#FFFFFF" strokeWidth={2} />
        )}
      </svg>
      <p className="mt-1 text-sm text-text-muted">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-white">{pct(metric.you)}</p>
      {change && <p className="text-xs">{change}</p>}
      <p className="text-xs text-text-muted">{`Competitor avg ${pct(metric.competitorAvg)}`}</p>
    </div>
  )
}
