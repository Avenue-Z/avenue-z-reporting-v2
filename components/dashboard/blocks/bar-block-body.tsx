import { BarChart } from '@/components/charts/bar-chart'
import { BlockBodyError } from '../metric-block-states'
import { toBarChartInput } from '@/lib/dashboard/charts'
import type { GroupedResult } from '@/lib/dashboard/types'

const TARGET_COLOR = '#5DD39E'   // green
const CEILING_COLOR = '#FF8A3D'  // orange
const COMPARE_COLOR = 'rgba(255,255,255,0.25)'

export interface BarBlockBodyProps {
  name: string
  groupedPromise: Promise<GroupedResult>
  target?: number
  ceiling?: number
  slug: string
}

/** Async server component: awaits the grouped promise and renders the bar chart card.
 *  On error / no-data, renders <BlockBodyError>. */
export async function BarBlockBody({ name, groupedPromise, target, ceiling, slug }: BarBlockBodyProps) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={name} error="no-data" slug={slug} />

  const input = toBarChartInput(r, target, ceiling)
  const yKeys = input.hasCompare
    ? [
        { key: 'value', label: 'Current' },
        { key: 'prevValue', label: 'Prior', color: COMPARE_COLOR },
      ]
    : [{ key: 'value' }]
  const referenceLines = [
    ...(input.target !== undefined  ? [{ value: input.target,  color: TARGET_COLOR,  label: `Target ${input.target}` }]  : []),
    ...(input.ceiling !== undefined ? [{ value: input.ceiling, color: CEILING_COLOR, label: `Ceiling ${input.ceiling}` }] : []),
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 flex-1 min-h-0">
        <BarChart
          data={input.data}
          xKey="dim"
          yKeys={yKeys}
          orientation="horizontal"
          referenceLines={referenceLines}
          unwrapped
          height="100%"
        />
      </div>
    </div>
  )
}
