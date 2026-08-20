'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

// ── Shared types ────────────────────────────────────────────────────────────

export interface ChannelVolumeRow {
  name: string
  sessions: number
  pct: number
  color: string
  convRate: number
}

export interface ChannelConvRow {
  name: string
  sessions: number
  convRate: number // decimal e.g. 0.032
  color: string
}

interface SourceMediumEntry {
  name: string
  sessions: number
}

interface ChannelTabsChartProps {
  volumeData: ChannelVolumeRow[]
  convData: ChannelConvRow[]
  compareMap?: Record<string, number>
  compareLabel?: string
  sourceMediumMap?: Record<string, SourceMediumEntry[]>
}

type Tab = 'volume' | 'conversion'

const TABS: { id: Tab; label: string; tooltip: string }[] = [
  {
    id:      'volume',
    label:   'By Volume',
    tooltip: 'Sessions broken down by acquisition channel, ranked by total volume. Each bar shows session count and share of total traffic. Hover any channel to compare against the prior period and see the top source / medium pairs driving it.',
  },
  {
    id:      'conversion',
    label:   'By Conversion',
    tooltip: 'The same channels ranked by conversion rate instead of session volume. Reveals which sources bring the highest-quality traffic — a channel driving fewer sessions but converting at 3× the rate is often more valuable.',
  },
]

// ── Sub-components ──────────────────────────────────────────────────────────

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

// ── Main component ──────────────────────────────────────────────────────────

export function ChannelTabsChart({
  volumeData,
  convData,
  compareMap = {},
  compareLabel,
  sourceMediumMap = {},
}: ChannelTabsChartProps) {
  const [tab,     setTab]     = useState<Tab>('volume')
  const [hovered, setHovered] = useState<string | null>(null)
  const [sortBy,  setSortBy]  = useState<'sessions' | 'cvr'>('sessions')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  const activeTab  = TABS.find((t) => t.id === tab)!
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

  // ── Sorted data ────────────────────────────────────────────────────────────
  const sortedVolumeData = useMemo(() =>
    [...volumeData].sort((a, b) =>
      sortBy === 'cvr' ? sortFn(a.convRate, b.convRate) : sortFn(a.sessions, b.sessions)
    ), [volumeData, sortBy, sortDir])

  const sortedConvData = useMemo(() =>
    [...convData].sort((a, b) =>
      sortBy === 'sessions' ? sortFn(a.sessions, b.sessions) : sortFn(a.convRate, b.convRate)
    ), [convData, sortBy, sortDir])

  // ── Scale maxes stay on full unsorted data so bars are consistent ──────────
  const volMax  = Math.max(...volumeData.map((r) => r.sessions), 1)
  const convMax = Math.max(...convData.map((r) => r.convRate), 0.001)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Traffic by Channel</h3>
          <Tooltip text={activeTab.tooltip} />
        </div>

        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                setSortBy(t.id === 'volume' ? 'sessions' : 'cvr')
                setSortDir('desc')
                setHovered(null)
              }}
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

      {/* ── Shared column headers ── */}
      <div className="mb-1 flex items-center gap-3 px-2">
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

      {/* ── By Volume ── */}
      {tab === 'volume' && (
        <div className="space-y-1">
          {sortedVolumeData.map((row) => {
            const barWidth      = (row.sessions / volMax) * 100
            // A channel absent from compareMap (truncated out of the compare
            // period's ranking, not merely a real zero) must read as "no prior
            // data," not "Prior period 0": the two mean very different things.
            // `in` distinguishes "key never set" from "key set to an observed 0".
            const hasPrior      = row.name in compareMap
            const priorSessions = compareMap[row.name] ?? 0
            const isHovered     = hovered === row.name
            const isDimmed      = hovered !== null && !isHovered
            const smEntries     = sourceMediumMap[row.name] ?? []
            const smMax         = smEntries[0]?.sessions ?? 1

            return (
              <div
                key={row.name}
                className={cn(
                  'rounded-md transition-all duration-200',
                  isDimmed ? 'opacity-25' : 'opacity-100',
                  isHovered ? 'bg-white/[0.03]' : ''
                )}
                onMouseEnter={() => setHovered(row.name)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-3 px-2 py-1.5">
                  {/* Channel name — flex-1 on mobile, fixed on sm+ */}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:w-44 sm:flex-none">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="truncate text-sm text-white/80">{row.name}</span>
                  </div>

                  {/* Bar — hidden on mobile */}
                  <div className="relative hidden h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barWidth}%`, backgroundColor: row.color, opacity: 0.85 }}
                    />
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                    {isHovered && hasCompare ? (
                      <>
                        <div className="text-right">
                          <p className="text-[10px] text-text-muted">Prior period</p>
                          <p className="tabular-nums text-xs font-medium text-white/50">
                            {hasPrior ? priorSessions.toLocaleString() : '—'}
                          </p>
                        </div>
                        <div className="hidden h-6 w-px bg-white/10 sm:block" />
                        <div className="text-right">
                          {hasPrior && <Delta current={row.sessions} prior={priorSessions} />}
                          <p className="tabular-nums text-sm font-semibold text-white">
                            {row.sessions.toLocaleString()}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className={cn(
                          'w-14 text-right tabular-nums sm:w-20',
                          sortBy === 'sessions' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                        )}>
                          {row.sessions.toLocaleString()}
                        </span>
                        <span className={cn(
                          'hidden w-16 text-right tabular-nums sm:block',
                          sortBy === 'cvr' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                        )}>
                          {(row.convRate * 100).toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Source / medium sub-rows on hover */}
                {isHovered && smEntries.length > 0 && (
                  <div className="px-2 pb-2.5 pt-0.5">
                    <div className="ml-6 space-y-1.5 sm:ml-[calc(theme(spacing.44)+theme(spacing.4))]">
                      {smEntries.map((sm) => (
                        <div key={sm.name} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40" title={sm.name}>
                            {sm.name}
                          </span>
                          <div className="relative hidden h-[3px] w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(sm.sessions / smMax) * 100}%`, backgroundColor: row.color, opacity: 0.5 }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right tabular-nums text-[11px] text-white/40">
                            {sm.sessions.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── By Conversion ── */}
      {tab === 'conversion' && (
        <div className="space-y-1">
          {sortedConvData.map((d) => {
            const barW      = (d.convRate / convMax) * 100
            const isHov     = hovered === d.name
            const isDimmed  = hovered !== null && !isHov
            const smEntries = sourceMediumMap[d.name] ?? []
            const smMax     = smEntries[0]?.sessions ?? 1

            return (
              <div
                key={d.name}
                className={cn(
                  'rounded-md transition-all duration-200',
                  isDimmed ? 'opacity-25' : 'opacity-100',
                  isHov    ? 'bg-white/[0.03]' : ''
                )}
                onMouseEnter={() => setHovered(d.name)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-3 px-2 py-1.5">
                  {/* Channel name — flex-1 on mobile, fixed on sm+ */}
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:w-44 sm:flex-none">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="truncate text-sm text-white/80">{d.name}</span>
                  </div>

                  {/* Bar — hidden on mobile */}
                  <div className="relative hidden h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: d.color, opacity: 0.85 }}
                    />
                  </div>

                  <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                    <span className={cn(
                      'w-14 text-right tabular-nums sm:w-20',
                      sortBy === 'sessions' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                    )}>
                      {d.sessions.toLocaleString()}
                    </span>
                    <span className={cn(
                      'hidden w-16 text-right tabular-nums sm:block',
                      sortBy === 'cvr' ? 'text-sm font-bold text-white' : 'text-xs text-white/40'
                    )}>
                      {(d.convRate * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Source / medium sub-rows on hover */}
                {isHov && smEntries.length > 0 && (
                  <div className="px-2 pb-2.5 pt-0.5">
                    <div className="ml-6 space-y-1.5 sm:ml-[calc(theme(spacing.44)+theme(spacing.4))]">
                      {smEntries.map((sm) => (
                        <div key={sm.name} className="flex items-center gap-3">
                          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40" title={sm.name}>
                            {sm.name}
                          </span>
                          <div className="relative hidden h-[3px] w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.06] sm:block">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(sm.sessions / smMax) * 100}%`, backgroundColor: d.color, opacity: 0.5 }}
                            />
                          </div>
                          <span className="w-14 shrink-0 text-right tabular-nums text-[11px] text-white/40">
                            {sm.sessions.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
