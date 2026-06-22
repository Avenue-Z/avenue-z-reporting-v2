'use client'
import { useState } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  /**
   * Row property to sort this column by (defaults to `key`). Use this to point
   * a formatted column at a raw numeric "shadow" field. Must be a plain string
   * — NOT a function — so columns stay serializable across the RSC→Client
   * boundary (a server component can render <DataTable/> directly).
   */
  sortKey?: string
}

interface DataTableProps {
  columns: Column[]
  rows: Record<string, React.ReactNode>[]
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  totalsRow?: Record<string, React.ReactNode>
}

export function sortRows(
  rows: Record<string, React.ReactNode>[],
  key: string,
  dir: 'asc' | 'desc',
  sortKey?: string,
) {
  const field = sortKey ?? key
  const sorted = [...rows].sort((a, b) => {
    const av = a[field] as number | string, bv = b[field] as number | string
    if (av < bv) return -1
    if (av > bv) return 1
    return 0
  })
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function DataTable({ columns, rows, defaultSort, totalsRow }: DataTableProps) {
  const [sort, setSort] = useState(defaultSort ?? null)
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined
  const display = sort && col?.sortable ? sortRows(rows, sort.key, sort.dir, col.sortKey) : rows
  const canSort = (c: Column) => Boolean(c.sortable)

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={canSort(c) ? () => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
                className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'} ${canSort(c) ? 'cursor-pointer select-none hover:text-white' : ''}`}
              >
                {c.label}{canSort(c) && sort?.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {display.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.04] transition-colors hover:bg-bg-subtle/50">
              {columns.map((c) => (
                <td key={c.key} className={`px-5 py-3 text-white ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{row[c.key]}</td>
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
