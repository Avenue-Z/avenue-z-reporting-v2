'use client'

import { useState } from 'react'
import { CHART_COLORS } from '@/lib/constants'

export interface HeatmapCell {
  day: number   // 0 = Sunday … 6 = Saturday (GA4 convention)
  hour: number  // 0–23
  sessions: number
}

interface DayHourHeatmapProps {
  data: HeatmapCell[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Reorder so week starts Monday
const DAY_ORDER  = [1, 2, 3, 4, 5, 6, 0]

function fmtHour(h: number): string {
  if (h === 0)  return '12a'
  if (h < 12)  return `${h}a`
  if (h === 12) return '12p'
  return `${h - 12}p`
}

export function DayHourHeatmap({ data }: DayHourHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; sessions: number } | null>(null)

  // Build lookup map: day → hour → sessions
  const grid: Record<number, Record<number, number>> = {}
  for (const cell of data) {
    if (!grid[cell.day]) grid[cell.day] = {}
    grid[cell.day][cell.hour] = (grid[cell.day][cell.hour] ?? 0) + cell.sessions
  }

  const maxSessions = Math.max(...data.map((c) => c.sessions), 1)

  // Hour labels — show every 6 hours to reduce clutter in compact layout
  const HOURS = Array.from({ length: 24 }, (_, i) => i)
  const SHOW_LABEL_HOURS = new Set([0, 6, 12, 18])

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Traffic by Day &amp; Hour</h3>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Sessions heatmap by day of week and hour of day. Brighter cells = more traffic. Use this to time content publishing, ad dayparting, and email sends for peak audience hours.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>

      {/* Horizontal scroll on mobile so 24 columns stay readable */}
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          {/* Hour header */}
          <div className="mb-0.5 flex items-center">
            <div className="w-8 shrink-0" />
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center">
                {SHOW_LABEL_HOURS.has(h) ? (
                  <span className="text-[8px] text-text-muted">{fmtHour(h)}</span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Rows */}
          {DAY_ORDER.map((dayIdx) => {
            const dayHours = grid[dayIdx] ?? {}

            return (
              <div key={dayIdx} className="mb-px flex items-center">
                {/* Day label */}
                <div className="w-8 shrink-0 pr-1.5 text-right">
                  <span className="text-[10px] font-medium text-text-muted">
                    {DAY_LABELS[dayIdx]}
                  </span>
                </div>

                {/* Hour cells */}
                {HOURS.map((h) => {
                  const sessions  = dayHours[h] ?? 0
                  const intensity = sessions / maxSessions
                  const isHovered = tooltip?.day === dayIdx && tooltip?.hour === h

                  return (
                    <div
                      key={h}
                      className="relative flex-1"
                      onMouseEnter={() => setTooltip({ day: dayIdx, hour: h, sessions })}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      <div
                        className="mx-px rounded-sm transition-all duration-150"
                        style={{
                          height:          '18px',
                          backgroundColor: CHART_COLORS.ga4,
                          opacity:         sessions === 0
                            ? 0.04
                            : 0.08 + intensity * 0.82,
                          outline:         isHovered ? `1px solid ${CHART_COLORS.ga4}` : 'none',
                          outlineOffset:   '1px',
                        }}
                      />

                      {/* Tooltip */}
                      {isHovered && sessions > 0 && (
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-[#1e1e1e] px-2.5 py-1.5 shadow-xl">
                          <p className="text-[11px] font-bold text-white">
                            {sessions.toLocaleString()} sessions
                          </p>
                          <p className="text-[10px] text-text-muted">
                            {DAY_LABELS[dayIdx]} {fmtHour(h)}–{fmtHour(h + 1 < 24 ? h + 1 : 0)}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-[9px] text-text-muted">Low</span>
            {[0.06, 0.2, 0.4, 0.6, 0.8, 1].map((op) => (
              <div
                key={op}
                className="h-2.5 w-4 rounded-sm"
                style={{ backgroundColor: CHART_COLORS.ga4, opacity: op }}
              />
            ))}
            <span className="text-[9px] text-text-muted">High</span>
          </div>
        </div>
      </div>
    </div>
  )
}
