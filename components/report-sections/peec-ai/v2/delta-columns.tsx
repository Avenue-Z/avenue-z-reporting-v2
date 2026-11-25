import { cn } from '@/lib/utils'
import type { SortableColumn } from '../sortable-table'
import { deltaTone, formatDelta, type DeltaUnit } from './delta'

const TONE_CLASS = {
  good: 'text-[#60FF80]',
  bad: 'text-[#FF4444]',
  neutral: 'text-text-muted',
} as const

export function deltaColumn<T>(opts: {
  key: string
  accessor: (row: T) => number | null | undefined
  unit: DeltaUnit
  betterWhen: 'higher' | 'lower'
  isNew?: (row: T) => boolean
  label?: string
  tooltip?: string
}): SortableColumn<T> {
  const { key, accessor, unit, betterWhen, isNew, label = 'Δ', tooltip } = opts
  return {
    key,
    label,
    tooltip,
    align: 'right',
    sortable: true,
    filterable: false,
    // New rows have no comparable delta: null sinks them to the bottom in both directions.
    accessor: (row) => (isNew?.(row) ? null : accessor(row)),
    render: (row) => {
      const fresh = isNew?.(row) ?? false
      const value = accessor(row)
      const tone = fresh ? 'neutral' : deltaTone(value, betterWhen, unit)
      const text = formatDelta(value, unit, { isNew: fresh })
      return (
        <span className={cn('tabular-nums', TONE_CLASS[tone])} title={text === '–' ? 'No comparison data' : undefined}>
          {text}
        </span>
      )
    },
  }
}
