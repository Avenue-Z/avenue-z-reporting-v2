'use client'

import { useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, FilterIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { InfoTooltip } from '@/components/ui/info-tooltip'

export interface SortableColumn<T> {
  key: string
  label: string
  tooltip?: string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  filterable?: boolean
  accessor?: (row: T) => string | number | Date | null | undefined
  render?: (row: T, index: number) => React.ReactNode
  headerClassName?: string
  cellClassName?: string
  width?: string
}

export interface SortableTableProps<T> {
  columns: SortableColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  initialPageSize?: number
  defaultSortKey?: string
  defaultSortDir?: 'asc' | 'desc'
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string
  emptyMessage?: string
}

type SortDir = 'asc' | 'desc' | null

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function stringifyForFilter(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  initialPageSize,
  defaultSortKey,
  defaultSortDir,
  onRowClick,
  rowClassName,
  emptyMessage = 'No rows to display.',
}: SortableTableProps<T>) {
  const [sortKey, setSortKey]   = useState<string | null>(defaultSortKey ?? null)
  const [sortDir, setSortDir]   = useState<SortDir>(defaultSortDir ?? null)
  const [filters, setFilters]   = useState<Record<string, string>>({})
  const [showAll, setShowAll]   = useState(false)

  const sortedRows = useMemo(() => {
    let result = rows

    // Apply per-column substring filters
    const activeFilters = Object.entries(filters).filter(([, v]) => v.trim() !== '')
    if (activeFilters.length > 0) {
      result = result.filter((row) =>
        activeFilters.every(([key, needle]) => {
          const col = columns.find((c) => c.key === key)
          if (!col) return true
          const raw = col.accessor ? col.accessor(row) : (row as Record<string, unknown>)[key]
          return stringifyForFilter(raw).toLowerCase().includes(needle.toLowerCase())
        })
      )
    }

    // Apply sort
    if (sortKey && sortDir) {
      const col = columns.find((c) => c.key === sortKey)
      if (col) {
        const accessor = col.accessor ?? ((r: T) => (r as Record<string, unknown>)[sortKey] as string | number)
        result = [...result].sort((a, b) => {
          const cmp = compareValues(accessor(a), accessor(b))
          return sortDir === 'asc' ? cmp : -cmp
        })
      }
    }

    return result
  }, [rows, columns, filters, sortKey, sortDir])

  const visibleRows = initialPageSize && !showAll
    ? sortedRows.slice(0, initialPageSize)
    : sortedRows

  const totalAfterFilter = sortedRows.length
  const activeFilterCount = Object.values(filters).filter((v) => v.trim() !== '').length

  function cycleSort(key: string) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    if (sortDir === 'asc')  { setSortDir('desc'); return }
    if (sortDir === 'desc') { setSortKey(null); setSortDir(null); return }
    setSortDir('asc')
  }

  function setFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  function clearAllFilters() {
    setFilters({})
  }

  return (
    <div className="overflow-hidden">
      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between border-b border-white/[0.04] px-4 py-2">
          <span className="text-[11px] font-semibold text-text-muted">
            {totalAfterFilter} of {rows.length} rows match {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
          </span>
          <button
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted transition-colors hover:text-white"
          >
            <XIcon className="h-3 w-3" /> Clear all filters
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.04]">
              {columns.map((col) => {
                const isSortable = col.sortable !== false
                const isFilterable = col.filterable !== false
                const isSorted = sortKey === col.key && sortDir
                const isFiltered = (filters[col.key] ?? '').trim() !== ''
                const align = col.align ?? 'left'

                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted',
                      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                      col.headerClassName,
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5',
                        align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start',
                      )}
                    >
                      {isSortable ? (
                        <button
                          onClick={() => cycleSort(col.key)}
                          className={cn(
                            'group inline-flex items-center gap-1 transition-colors hover:text-white',
                            isSorted && 'text-white',
                          )}
                          aria-label={`Sort by ${col.label}`}
                        >
                          {col.label}
                          {isSorted === 'asc'  ? <ArrowUpIcon   className="h-3 w-3" /> :
                           isSorted === 'desc' ? <ArrowDownIcon className="h-3 w-3" /> :
                           <ArrowUpDownIcon className="h-3 w-3 opacity-30 group-hover:opacity-100" />}
                        </button>
                      ) : (
                        <span>{col.label}</span>
                      )}

                      {col.tooltip && (
                        <InfoTooltip text={col.tooltip} />
                      )}

                      {isFilterable && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                'flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-white/[0.06]',
                                isFiltered ? 'text-brand-cyan' : 'text-text-muted/40 hover:text-text-muted',
                              )}
                              aria-label={`Filter ${col.label}`}
                            >
                              <FilterIcon className="h-2.5 w-2.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-56 border-white/[0.08] bg-[#1a1a1a] p-2 shadow-2xl"
                            align="start"
                            sideOffset={6}
                          >
                            <div className="flex items-center gap-1.5">
                              <input
                                autoFocus
                                value={filters[col.key] ?? ''}
                                onChange={(e) => setFilter(col.key, e.target.value)}
                                placeholder={`Filter ${col.label.toLowerCase()}…`}
                                className="flex-1 rounded-md border border-white/[0.08] bg-bg-surface px-2 py-1.5 text-xs text-white placeholder:text-text-muted/50 focus:border-white/25 focus:outline-none"
                              />
                              {isFiltered && (
                                <button
                                  onClick={() => setFilter(col.key, '')}
                                  className="rounded-md p-1 text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
                                  aria-label="Clear filter"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-xs text-text-muted">
                  {activeFilterCount > 0 ? 'No rows match the current filters.' : emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row, idx) => {
                const extra = rowClassName ? rowClassName(row) : ''
                return (
                  <tr
                    key={rowKey(row, idx)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]',
                      onRowClick && 'cursor-pointer',
                      extra,
                    )}
                  >
                    {columns.map((col) => {
                      const align = col.align ?? 'left'
                      const cellContent = col.render
                        ? col.render(row, idx)
                        : col.accessor
                          ? String(col.accessor(row) ?? '')
                          : String((row as Record<string, unknown>)[col.key] ?? '')
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'px-4 py-3',
                            align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
                            col.cellClassName,
                          )}
                        >
                          {cellContent}
                        </td>
                      )
                    })}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {initialPageSize && totalAfterFilter > initialPageSize && (
        <div className="border-t border-white/[0.04] px-5 py-3">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-text-muted transition-colors hover:text-white"
          >
            {showAll ? 'Show less' : `See all ${totalAfterFilter} rows`}
          </button>
        </div>
      )}
    </div>
  )
}
