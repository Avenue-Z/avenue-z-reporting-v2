'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'

export interface EventRow {
  name: string
  count: number
  perUser: number
  keyEvents: number
}

interface TopEventsProps {
  events: EventRow[]
}

type Tab = 'all' | 'key'

const TABS: { id: Tab; label: string; tooltip: string }[] = [
  {
    id:      'all',
    label:   'All Events',
    tooltip: 'Every action tracked as a GA4 event, ranked by total fires. Includes automatic events (page_view, scroll) and custom events (form submissions, clicks, video plays). Events per user shows how frequently each action occurs per individual visitor.',
  },
  {
    id:      'key',
    label:   'Key Events',
    tooltip: 'Events marked as Key Events (formerly Conversions) in your GA4 property — high-value actions like form submissions, purchases, or sign-ups. Ranked by key event count.',
  },
]

const ALL_COLOR = CHART_COLORS.ga4      // blue
const KEY_COLOR = CHART_COLORS.positive // green

export function TopEvents({ events }: TopEventsProps) {
  const [tab,     setTab]     = useState<Tab>('all')
  const [hovered, setHovered] = useState<string | null>(null)

  const activeTab = TABS.find((t) => t.id === tab)!

  const rows = tab === 'all'
    ? events
    : events
        .filter((e) => e.keyEvents > 0)
        .sort((a, b) => b.keyEvents - a.keyEvents)

  const barColor = tab === 'all' ? ALL_COLOR : KEY_COLOR
  const max      = tab === 'all'
    ? Math.max(...rows.map((e) => e.count), 1)
    : Math.max(...rows.map((e) => e.keyEvents), 1)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Top Events</h3>
          <div className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
              ?
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {activeTab.tooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setHovered(null) }}
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

      {/* Empty state for Key Events */}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-text-muted/50">
          No key events recorded in this period. Mark events as Key Events in your GA4 property settings to see them here.
        </p>
      ) : (
        <>
          {/* Column headers */}
          <div className="mb-2 flex items-center gap-4 px-2">
            <div className="w-8 shrink-0" />
            <div className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Event
            </div>
            <div className="w-32 shrink-0" />
            <div className="w-20 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">
              {tab === 'all' ? 'Count' : 'Key Events'}
            </div>
            {tab === 'all' && (
              <div className="w-20 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Per User
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            {rows.map((ev, i) => {
              const value  = tab === 'all' ? ev.count : ev.keyEvents
              const barW   = (value / max) * 100
              const isHov    = hovered === ev.name
              const isDimmed = hovered !== null && !isHov

              return (
                <div
                  key={ev.name}
                  className={cn(
                    'flex items-center gap-4 rounded-md px-2 py-1.5 transition-all duration-200',
                    isDimmed ? 'opacity-25' : 'opacity-100',
                    isHov    ? 'bg-white/[0.03]' : ''
                  )}
                  onMouseEnter={() => setHovered(ev.name)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Rank */}
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{
                      backgroundColor: i < 3 ? barColor : 'rgba(255,255,255,0.1)',
                      color:           i < 3 ? '#000'   : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {i + 1}
                  </span>

                  {/* Event name */}
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-sm text-white/80" title={ev.name}>
                      {ev.name}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="relative h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: barColor, opacity: 0.8 }}
                    />
                  </div>

                  {/* Primary count */}
                  <span className="w-20 shrink-0 text-right tabular-nums text-sm font-semibold text-white">
                    {value.toLocaleString()}
                  </span>

                  {/* Per user — only in All Events tab */}
                  {tab === 'all' && (
                    <span className="w-20 shrink-0 text-right tabular-nums text-xs text-text-muted">
                      {ev.perUser.toFixed(2)}×
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
