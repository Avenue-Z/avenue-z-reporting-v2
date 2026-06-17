'use client'
import { useState } from 'react'

interface Column {
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  sortValue?: (row: Record<string, React.ReactNode>) => number | string
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

export function DataTable({ columns, rows, defaultSort, totalsRow }: DataTableProps) {
  const [sort, setSort] = useState(defaultSort ?? null)
  const col = sort ? columns.find((c) => c.key === sort.key) : undefined
  const display = sort && col?.sortValue ? sortRows(rows, sort.key, sort.dir, col.sortValue) : rows

  return (
    <div className="overflow-x-auto rounded-lg border border-white/[0.06] bg-bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={c.sortable ? () => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' })) : undefined}
                className={`px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-text-muted ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.sortable ? 'cursor-pointer select-none hover:text-white' : ''}`}
              >
                {c.label}{sort?.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
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
