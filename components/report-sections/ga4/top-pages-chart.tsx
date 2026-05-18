'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

export interface PageRow {
  page: string
  sessions: number
  convRate: number // decimal, e.g. 0.023
}

interface TopPagesChartProps {
  pages: PageRow[]
  entryPages: PageRow[]
  comparePageMap?: Record<string, number>
  compareEntryMap?: Record<string, number>
  compareLabel?: string
  stalePagePaths?: string[]
  staleEntryPaths?: string[]
}

type Tab = 'pages' | 'entry'

const TABS: { id: Tab; label: string; tooltip: string }[] = [
  {
    id:      'pages',
    label:   'All Pages',
    tooltip: 'The most-visited pages across all sessions in the period. CVR shows the percentage of sessions touching that page that resulted in a conversion. Click Sessions or CVR to re-sort.',
  },
  {
    id:      'entry',
    label:   'Entry Pages',
    tooltip: 'The pages where visitors most often begin their session — i.e. the first page they see. High entry page traffic signals strong SEO, ad landing pages, or direct links. CVR reflects the quality of traffic arriving through each entry point.',
  },
]

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

function Delta({ current, prior }: { current: number; prior: number }) {
  if (!prior) return null
  const diff = ((current - prior) / prior) * 100
  const up   = diff >= 0
  return (
    <span className="text-xs font-bold" style={{ color: up ? '#60FF80' : '#FF4444' }}>
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}%
    </span>
  )
}

const BAR_COLOR = '#39A0FF' // ga4 blue

export function TopPagesChart({
  pages,
  entryPages,
  comparePageMap = {},
  compareEntryMap = {},
  compareLabel,
  stalePagePaths  = [],
  staleEntryPaths = [],
}: TopPagesChartProps) {
  const [tab,        setTab]        = useState<Tab>('pages')
  const [hovered,    setHovered]    = useState<string | null>(null)
  const [risingOnly, setRisingOnly] = useState(false)
  const [sortBy,     setSortBy]     = useState<'sessions' | 'cvr'>('sessions')
  const [sortDir,    setSortDir]    = useState<'desc' | 'asc'>('desc')

  const activeTab  = TABS.find((t) => t.id === tab)!
  const staleSet   = new Set(tab === 'pages' ? stalePagePaths : staleEntryPaths)
  const compareMap = tab === 'pages' ? comparePageMap : compareEntryMap
  const hasCompare = Object.keys(compareMap).length > 0

  function handleSort(col: 'sessions' | 'cvr') {
    if (col === sortBy) {
      setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const sortFn = (aVal: number, bVal: number) =>
    sortDir === 'desc' ? bVal - aVal : aVal - bVal

  const DISPLAY_LIMIT = 10

  const allRows  = tab === 'pages' ? pages : entryPages
  const filtered = risingOnly ? allRows.filter((r) => !staleSet.has(r.page)) : allRows
  const rows     = useMemo(() =>
    [...filtered]
      .sort((a, b) => sortBy === 'cvr' ? sortFn(a.convRate, b.convRate) : sortFn(a.sessions, b.sessions))
      .slice(0, DISPLAY_LIMIT),
    [filtered, sortBy, sortDir]
  )
  const max = Math.max(...rows.map((r) => r.sessions), 1)

  const hasStaleData   = staleSet.size > 0
  // How many from the full 25-row pool would be hidden in rising mode
  const wouldHideCount = allRows.filter((r) => staleSet.has(r.page)).length
  const hiddenCount    = risingOnly ? Math.min(wouldHideCount, allRows.length - filtered.length) : wouldHideCount

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Top Pages</h3>
          <Tooltip text={activeTab.tooltip} />
        </div>

        <div className="flex items-center gap-2">
          {/* Rising toggle */}
          {hasStaleData && (
            <button
              onClick={() => { setRisingOnly((v) => !v); setHovered(null) }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all duration-150',
                risingOnly
                  ? 'border-[#60FF80]/40 bg-[#60FF80]/10 text-[#60FF80]'
                  : 'border-white/10 bg-white/[0.04] text-text-muted hover:text-white/60'
              )}
              title="Hide pages that have been in the top 10 for the last 90 days"
            >
              <span>↑</span>
              <span>Rising</span>
            </button>
          )}

          {/* Vertical divider */}
          {hasStaleData && <div className="h-5 w-px bg-white/10" />}

          {/* View tabs */}
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSortBy('sessions'); setSortDir('desc'); setHovered(null) }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold transition-all duration-150',
                  tab === t.id
                    ? 'bg-white/10 text-white'
                    : 'text-text-muted hover:text-white/60'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rising filter summary */}
      {risingOnly && hiddenCount > 0 && (
        <p className="mb-3 text-[11px] text-text-muted/60">
          Pages in the top 10 for the last 90 days are excluded. Only newer, climbing pages are shown.
        </p>
      )}

      {/* Empty state */}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted/50 italic">
          All pages have been in the top 10 for the last 90 days. Disable Rising to see them.
        </p>
      ) : (
        <>
          {/* Column headers */}
          <div className="mb-1 flex items-center gap-3 px-2">
            <div className="w-5 shrink-0" />
            <div className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
            <div className="hidden flex-1 sm:block" />
            <div className="flex shrink-0 items-center justify-end gap-3">
              <button
                onClick={() => handleSort('sessions')}
                className={cn(
                  'w-16 text-right text-[10px] uppercase tracking-wider transition-colors duration-150 sm:w-20',
                  sortBy === 'sessions' ? 'font-bold text-white' : 'font-bold text-text-muted hover:text-white/60'
                )}
              >
                {sortBy === 'sessions' ? (sortDir === 'desc' ? '↓ ' : '↑ ') : ''}Sessions
              </button>
              <button
                onClick={() => handleSort('cvr')}
                className={cn(
                  'hidden w-16 text-right text-[10px] uppercase tracking-wider transition-colors duration-150 sm:block',
                  sortBy === 'cvr' ? 'font-bold text-white' : 'font-bold text-text-muted hover:text-white/60'
                )}
              >
                {sortBy === 'cvr' ? (sortDir === 'desc' ? '↓ ' : '↑ ') : ''}CVR
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {rows.map((row, i) => {
              const barW      = (row.sessions / max) * 100
              const prior     = compareMap[row.page] ?? 0
              const isHovered = hovered === row.page
              const isDimmed  = hovered !== null && !isHovered
              const hasPrior  = isHovered && hasCompare && prior > 0

              return (
                <div
                  key={row.page}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-2 py-2 transition-all duration-200',
                    isDimmed  ? 'opacity-25' : 'opacity-100',
                    isHovered ? 'bg-white/[0.03]' : '',
                  )}
                  onMouseEnter={() => setHovered(row.page)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Rank badge */}
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{
                      backgroundColor: i < 3 ? BAR_COLOR : 'rgba(255,255,255,0.1)',
                      color:           i < 3 ? '#000'    : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {i + 1}
                  </span>

                  {/* Page path — flex-1 on mobile, fixed on sm+ */}
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs text-white/70 sm:w-44 sm:flex-none"
                    title={row.page}
                  >
                    {row.page}
                  </span>

                  {/* Bar — hidden on mobile */}
                  <div className="relative hidden h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: BAR_COLOR, opacity: 0.8 }}
                    />
                  </div>

                  {/* Right: sessions + CVR */}
                  <div className="flex shrink-0 items-center justify-end gap-3">
                    <div className="w-16 text-right sm:w-20">
                      <p className={cn(
                        'tabular-nums',
                        sortBy === 'sessions' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                      )}>
                        {row.sessions.toLocaleString()}
                        {hasPrior && <Delta current={row.sessions} prior={prior} />}
                      </p>
                      {hasPrior && (
                        <p className="tabular-nums text-[10px] text-text-muted">
                          Prior: {prior.toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className={cn(
                      'hidden w-16 text-right tabular-nums sm:block',
                      sortBy === 'cvr' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                    )}>
                      {(row.convRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
