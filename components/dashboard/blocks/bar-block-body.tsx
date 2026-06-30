// components/dashboard/blocks/bar-block-body.tsx
import { CapsuleColumnChart } from '@/components/charts/capsule-column-chart'
import { ChartCard } from '@/components/charts/chart-card'
import { BlockBodyError } from '../metric-block-states'
import { EditableText } from '../editable-text'
import { toCapsuleBarInput } from '@/lib/dashboard/charts'
import { formatMetric } from '@/lib/dashboard/format'
import type { GroupedResult, LabelOverrides } from '@/lib/dashboard/types'

export interface BarBlockBodyProps {
  name: string
  groupedPromise: Promise<GroupedResult>
  target?: number
  ceiling?: number
  topN?: number
  slug: string
  canEdit: boolean
  blockId: string
  labelOverrides?: LabelOverrides
}

/** Async server component: awaits the grouped promise and renders the polished
 *  vertical bar chart inside the shared ChartCard grey box (matches the AEO
 *  overview graph). On error / no-data, <BlockBodyError>. */
export async function BarBlockBody({ name, groupedPromise, target, ceiling, topN, slug, canEdit, blockId, labelOverrides }: BarBlockBodyProps) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toCapsuleBarInput(r, labelOverrides, topN)
  // Pre-format display strings server-side; the client chart receives only
  // serializable props (no formatter function crosses the RSC boundary).
  const rows = input.rows.map((row) => ({
    name: row.name,
    key: row.key,
    value: row.value,
    label: formatMetric(row.value, r.format),
    ...(row.prior !== undefined
      ? { prior: row.prior, priorLabel: formatMetric(row.prior, r.format) }
      : {}),
  }))

  return (
    <ChartCard
      title={<EditableText value={name} slug={slug} target={{ kind: 'blockText', blockId, field: 'name' }} canEdit={canEdit} as="span" />}
      fill
    >
      <CapsuleColumnChart
        rows={rows}
        compareLabel="Prior period"
        target={target}
        ceiling={ceiling}
        slug={slug}
        canEdit={canEdit}
        dimKey={input.dimKey}
      />
    </ChartCard>
  )
}
