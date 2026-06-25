import { AreaChart } from '@/components/charts/area-chart'
import { BlockBodyError } from '../metric-block-states'
import { toLineChartInput } from '@/lib/dashboard/charts'
import type { SeriesResult } from '@/lib/dashboard/types'

export interface LineBlockBodyProps {
  name: string
  seriesPromise: Promise<SeriesResult>
  slug: string
}

/** Async server component: awaits the series promise and renders the line chart card.
 *  On error / no-data, renders <BlockBodyError>. */
export async function LineBlockBody({ name, seriesPromise, slug }: LineBlockBodyProps) {
  const r = await seriesPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.points.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toLineChartInput(r)

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 flex-1 min-h-0">
        <AreaChart
          data={input.data}
          xKey="bucketLabel"
          yKeys={[{ key: 'value', label: 'Current' }]}
          compareDataKey={input.hasCompare ? 'prevValue' : undefined}
          unwrapped
          height="100%"
        />
      </div>
    </div>
  )
}
