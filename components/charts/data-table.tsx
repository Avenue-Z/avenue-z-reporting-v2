'use client'
import { useState } from 'react'
import { EditableText } from '@/components/dashboard/editable-text'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  /** Declarative, RSC-serializable sort: row field to sort by (defaults to `key`)
   *  + comparison type. Preferred for columns built in Server Components. */
  sortKey?: string
  sortType?: 'number' | 'string'
  /** Sort accessor function — only usable from Client Components (functions can't
   *  cross the RSC boundary). Server callers should use sortKey/sortType instead. */
  sortValue?: (row: Record<string, React.ReactNode>) => number | string
  /** Set by toTableInput on the dimension column — enables inline editing. */
  editable?: boolean
  dimKey?: string
}

/** Resolve a column's sort accessor: an explicit function, else the declarative
 *  sortKey/sortType, else none (column not sortable). */
export function columnSortAccessor(
  col: Column,
): ((row: Record<string, React.ReactNode>) => number | string) | undefined {
  if (col.sortValue) return col.sortValue
  if (col.sortType === 'number') {
    const field = col.sortKey ?? col.key
    return (row) => { const n = row[field]; return typeof n === 'number' ? n : -Infinity }
  }
  if (col.sortType === 'string') {
    const field = col.sortKey ?? col.key
    return (row) => String(row[field] ?? '')
  }
  return undefined
}

interface DataTableProps {
  columns: Column[]
  rows: Record<string, React.ReactNode>[]
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  totalsRow?: Record<string, React.ReactNode>
  /** When true, omit the outer bordered card chrome — the caller supplies its own
   *  (e.g. the configurable dashboard wraps the table in <ChartCard>). Avoids a
   *  double card. Report sections leave this off and keep the self-contained card. */
  bare?: boolean
  /** Dashboard slug — required to enable inline editing of dim column headers/cells. */
  slug?: string
  /** Whether the current viewer can edit labels. */
  canEdit?: boolean
}

export function sortRows(
  rows: Record<string, React.ReactNode>[],
  key: string,
  dir: 'asc' | 'desc',
  sortValue: (row: Record<string, React.ReactNode>) => number | string,
) {
  const sorted = [...rows].sort((a, b) => {
    const av = sortValue(a), bv = sortValue(b)
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function DataTable({ columns, rows, defaultSort, totalsRow, bare = false, slug, canEdit }: DataTableProps) {
  const [sort, setSort] = useState(defaultSort ?? null)
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined
  const accessor = col ? columnSortAccessor(col) : undefined
  const display = sort && accessor ? sortRows(rows, sort.key, sort.dir, accessor) : rows
  const canSort = (c: Column) => Boolean(c.sortable && columnSortAccessor(c))

  return (
    <div className={bare ? 'overflow-x-auto' : 'overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface'}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => {
              const editingHeader = !!(c.editable && c.dimKey && slug && canEdit)
              const sortable = canSort(c) && !editingHeader
              return (
                <th
                  key={c.key}
                  onClick={sortable ? () => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
                  className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'} ${sortable ? 'cursor-pointer select-none hover:text-white' : ''}`}
                >
                  {c.editable && c.dimKey && slug
                    ? <EditableText value={String(c.label)} slug={slug} target={{ kind: 'labelDim', dimKey: c.dimKey }} canEdit={!!canEdit} as="span" className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted" />
                    : <>{c.label}{canSort(c) && sort?.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}</>
                  }
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {display.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.editable && c.dimKey && slug
                    ? <EditableText value={String(row[c.key] ?? '')} slug={slug} target={{ kind: 'labelValue', dimKey: c.dimKey, rawValue: String(row[`${c.dimKey}__raw`] ?? '') }} canEdit={!!canEdit} as="span" />
                    : row[c.key]
                  }
                </td>
              ))}
            </tr>
          ))}
          {totalsRow && (
            <tr className="border-t border-white/[0.12] font-semibold">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{totalsRow[c.key]}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
