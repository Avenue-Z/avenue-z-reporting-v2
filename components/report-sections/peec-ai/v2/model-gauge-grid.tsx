'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ModelStatV2, UsedAsSourceBasis } from '@/lib/aeo/v2/types'
import { useExportMode } from '@/components/export/export-mode'
import { ModelGauge } from './gauge'
import { GAUGE_PARAM, gaugeMetricLabel, parseGaugeMetric, serializeGaugeMetric, type GaugeMetric } from './gauge-metric'

const METRICS: GaugeMetric[] = ['visibility', 'sov', 'source']

const pick = (s: ModelStatV2, m: GaugeMetric) => (m === 'visibility' ? s.visibility : m === 'sov' ? s.sov : s.usedAsSource)

/**
 * Section 03's gauges, one per AI model. All three metrics arrive as plain data; the metric shown lives in the URL
 * (`aeoGauge`, ./gauge-metric.ts), so switching needs no server round trip and the PDF prints the same metric.
 * `compareSuffix` is the comparison's wording, passed in because ./compare.ts is server-only.
 */
export function ModelGaugeGrid({
  models,
  basis,
  showDeltas,
  compareSuffix,
}: {
  models: ModelStatV2[]
  basis: UsedAsSourceBasis
  showDeltas: boolean
  compareSuffix: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const exporting = useExportMode()
  const metric = parseGaugeMetric(searchParams.get(GAUGE_PARAM))
  const label = gaugeMetricLabel(metric, basis)

  if (models.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface" data-export-block="">
        <p className="px-5 py-4 text-sm text-text-muted">No data for the selected models.</p>
      </div>
    )
  }

  function write(next: GaugeMetric) {
    const params = new URLSearchParams(searchParams.toString())
    const value = serializeGaugeMetric(next)
    if (value === null) params.delete(GAUGE_PARAM)
    else params.set(GAUGE_PARAM, value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-3">
      {exporting ? (
        // Each gauge is its own unbreakable block; the line keeps with the first, so it never ends a page alone.
        <p className="text-xs text-text-muted" data-export-keep-with-next="">{`Metric shown: ${label}`}</p>
      ) : (
        <div className="flex gap-1 self-start rounded-lg bg-white/[0.04] p-0.5" data-export-hide="">
          {METRICS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === metric}
              onClick={() => write(m)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                m === metric ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
              )}
            >
              {gaugeMetricLabel(m, basis)}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {models.map((s) => (
          <ModelGauge
            key={s.model}
            model={s.model}
            metric={pick(s, metric)}
            metricLabel={label}
            showDeltas={showDeltas}
            compareSuffix={compareSuffix}
          />
        ))}
      </div>
    </div>
  )
}
