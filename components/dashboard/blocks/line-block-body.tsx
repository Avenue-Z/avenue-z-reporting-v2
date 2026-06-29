// components/dashboard/blocks/line-block-body.tsx
import { TrendAreaChart } from '@/components/charts/trend-area-chart'
import { ChartCard } from '@/components/charts/chart-card'
import { BlockBodyError } from '../metric-block-states'
import { EditableText } from '../editable-text'
import { toLineChartInput } from '@/lib/dashboard/charts'
import type { SeriesResult } from '@/lib/dashboard/types'

export interface LineBlockBodyProps {
  name: string
  seriesPromise: Promise<SeriesResult>
  slug: string
  canEdit: boolean
  blockId: string
}

/** Async server component: awaits the series promise and renders the polished
 *  trend area chart inside the shared ChartCard. On error / no-data, <BlockBodyError>. */
export async function LineBlockBody({ name, seriesPromise, slug, canEdit, blockId }: LineBlockBodyProps) {
  const r = await seriesPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.points.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toLineChartInput(r)

  return (
    <ChartCard
      title={<EditableText value={name} slug={slug} target={{ kind: 'blockText', blockId, field: 'name' }} canEdit={canEdit} as="span" />}
      fill
    >
      <TrendAreaChart
        data={input.data}
        xKey="bucketLabel"
        series={[{ key: 'value', label: 'Current' }]}
        compareKeys={input.hasCompare ? { value: 'prevValue' } : undefined}
        height="100%"
      />
    </ChartCard>
  )
}
