import type { ReactNode } from 'react'
import type { GroupedRow, MetricFormat } from './types'
import { formatMetric } from './format'

export interface TableInput {
  columns: {
    key: string
    label: string
    align?: 'left' | 'right'
    sortable?: boolean
    /** Declarative, RSC-serializable sort: the row field to sort by (defaults to
     *  `key`) and how to compare it. No functions — these cross the server→client
     *  boundary into <DataTable>. */
    sortKey?: string
    sortType?: 'number' | 'string'
  }[]
  rows: Record<string, ReactNode>[]
  defaultSort: { key: string; dir: 'asc' | 'desc' } | undefined
}

/** Convert a GroupedResult into props for <DataTable>. v1: single-dim, single-metric.
 *  Compare column appears iff any row has a defined prevValue. Numeric columns are
 *  right-aligned and sortable; undefined values sort below all defined values. */
export function toTableInput(
  r: { ok: true; rows: GroupedRow[]; format: MetricFormat },
): TableInput {
  // v1: single dim → take the first (and only) dim key from the first row.
  // The 'dim' fallback is unreachable — TableBlockBody short-circuits empty rows to <BlockBodyError>.
  const dimKey = r.rows.length > 0 ? Object.keys(r.rows[0].dim)[0] : 'dim'
  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)

  const VALUE = '__value__'
  const PREV = '__prev__'

  // Numeric columns sort by their hidden `${key}__sort` field; the dim column
  // sorts as a string by its own key. Declarative so the columns stay serializable.
  const columns: TableInput['columns'] = [
    { key: dimKey, label: dimKey, align: 'left', sortable: true, sortType: 'string' },
    { key: VALUE, label: 'Value', align: 'right', sortable: true, sortKey: `${VALUE}__sort`, sortType: 'number' },
  ]
  if (hasCompare) {
    columns.push({ key: PREV, label: 'Prev', align: 'right', sortable: true, sortKey: `${PREV}__sort`, sortType: 'number' })
  }

  const rows = r.rows.map((row) => {
    const out: Record<string, ReactNode> = {
      [dimKey]: row.dim[dimKey] ?? '',
      [VALUE]: row.value === undefined ? '—' : formatMetric(row.value, r.format),
      [`${VALUE}__sort`]: row.value ?? -Infinity,
    }
    if (hasCompare) {
      out[PREV] = row.prevValue === undefined ? '—' : formatMetric(row.prevValue, r.format)
      out[`${PREV}__sort`] = row.prevValue ?? -Infinity
    }
    return out
  })

  return { columns, rows, defaultSort: { key: VALUE, dir: 'desc' } }
}
