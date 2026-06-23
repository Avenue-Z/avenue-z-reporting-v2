// components/report-sections/peec-ai/visibility-chart.tsx
'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { bucketDaily } from '@/lib/aeo/bucket'
import type { DailyPoint, BucketGranularity } from '@/lib/aeo/types'
import { InfoTooltip } from '@/components/ui/info-tooltip'

const GRANULARITIES: { id: BucketGranularity; label: string }[] = [
  { id: 'daily',     label: 'Daily'     },
  { id: 'weekly',    label: 'Weekly'    },
  { id: 'monthly',   label: 'Monthly'   },
  { id: 'quarterly', label: 'Quarterly' },
]

export function VisibilityChart({
  data,
  competitorData,
  brandName,
  firstTrackedAt,
}: {
  data: DailyPoint[]
  competitorData: DailyPoint[]
  brandName?: string
  firstTrackedAt?: Date | null
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [granularity, setGranularity] = useState<BucketGranularity>('weekly')

  const buckets = useMemo(() => bucketDaily(data, granularity), [data, granularity])
  const compBuckets = useMemo(() => bucketDaily(competitorData, granularity), [competitorData, granularity])

  if (buckets.length === 0) return null

  const CHART_MAX = Math.max(...buckets.map((d) => d.visibility), ...compBuckets.map((d) => d.visibility), 1)
  const n = buckets.length
  const compMap = new Map(compBuckets.map((d) => [d.key, d.visibility]))
  // FB-022: Tracking-start date sourced from clients.firstTrackedAt (DB column),
  // not derived from the chart's data buffer (which was a misleading artifact of
  // the picker-bound fetch — see FB-022 decision log).
  const trackingStart = firstTrackedAt
    ? firstTrackedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : undefined

  const competitorPoints = buckets
    .map((b, i) => ({ x: (i + 0.5) / n, vis: compMap.get(b.key) ?? null }))
    .filter((p): p is { x: number; vis: number } => p.vis !== null)
  const svgPoints = competitorPoints
    .map((p) => `${(p.x * 100).toFixed(2)},${(100 - (p.vis / CHART_MAX) * 100).toFixed(2)}`)
    .join(' ')

  // Label every Nth bucket so the axis never crowds.
  const labelEvery = Math.max(1, Math.ceil(n / 16))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold uppercase tracking-widest text-text-muted">How has AI visibility grown this year?</p>
            <InfoTooltip text="Percentage of AI responses where your brand appears. Year-to-date — this chart shows the full year regardless of the page date picker." />
          </div>
          {brandName && <p className="mt-0.5 text-xs text-text-muted">{brandName} · {granularity}</p>}
          {trackingStart && <p className="mt-0.5 text-[11px] text-text-muted">Tracking began {trackingStart}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
            {GRANULARITIES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setGranularity(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                  granularity === id ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#60FDFF]" />
              {brandName ?? 'You'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[#8A8A8A]" />
              Competitor avg
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex h-40 w-9 shrink-0 flex-col justify-between text-right">
          {[CHART_MAX, CHART_MAX * 0.75, CHART_MAX * 0.5, CHART_MAX * 0.25, 0].map((v, i) => (
            <span key={i} className="text-[10px] leading-none tabular-nums text-text-muted">{Math.round(v)}%</span>
          ))}
        </div>
        <div className="relative h-40 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full border-t border-white/[0.04]" />
            ))}
          </div>

          <div className="relative flex h-full gap-1">
            {buckets.map((b, i) => {
              const heightPct = (b.visibility / CHART_MAX) * 100
              const isHovered = hovered === i
              const compVis = compMap.get(b.key)
              return (
                <div
                  key={b.key}
                  className="group relative h-full flex-1 cursor-default"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHovered && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-bold text-white">{b.visibility.toFixed(1)}%</p>
                      {compVis !== undefined && <p className="text-text-muted">Competitors: {compVis.toFixed(1)}%</p>}
                      <p className="text-text-muted">{b.label}</p>
                    </div>
                  )}
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm transition-colors duration-150"
                    style={{
                      height: `${Math.max(heightPct, 1)}%`,
                      backgroundColor: isHovered ? '#9BFEFF' : '#60FDFF',
                      opacity: hovered !== null && !isHovered ? 0.35 : 1,
                    }}
                  />
                </div>
              )
            })}
          </div>

          {competitorPoints.length > 1 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={svgPoints} fill="none" stroke="#8A8A8A" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="w-9 shrink-0" />
        <div className="flex flex-1 gap-1">
          {buckets.map((b, i) => (
            <div key={b.key} className="flex-1 overflow-hidden text-center">
              {i % labelEvery === 0 && <span className="text-[9px] tabular-nums text-text-muted">{b.label}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
