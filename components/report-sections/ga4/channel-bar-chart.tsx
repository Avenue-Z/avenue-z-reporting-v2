'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ChannelRow {
  name: string
  sessions: number
  pct: number
  color: string
}

interface SourceMediumEntry {
  name: string
  sessions: number
}

interface ChannelBarChartProps {
  data: ChannelRow[]
  compareMap?: Record<string, number>
  compareLabel?: string
  sourceMediumMap?: Record<string, SourceMediumEntry[]>
}

function Delta({ current, prior }: { current: number; prior: number }) {
  if (!prior) return null
  const diff = ((current - prior) / prior) * 100
  const up   = diff >= 0
  return (
    <span
      className="text-xs font-bold"
      style={{ color: up ? '#60FF80' : '#FF4444' }}
    >
      {up ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}%
    </span>
  )
}

export function ChannelBarChart({
  data,
  compareMap = {},
  compareLabel,
  sourceMediumMap = {},
}: ChannelBarChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const max        = Math.max(...data.map((r) => r.sessions), 1)
  const hasCompare = Object.keys(compareMap).length > 0

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 space-y-1">
      {data.map((row) => {
        const barWidth       = (row.sessions / max) * 100
        const priorSessions  = compareMap[row.name] ?? 0
        const isHovered      = hovered === row.name
        const isDimmed       = hovered !== null && !isHovered
        const smEntries      = sourceMediumMap[row.name] ?? []
        const smMax          = smEntries[0]?.sessions ?? 1

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
            {/* Main row */}
            <div className="flex items-center gap-4 px-2 py-1.5">
              {/* Dot + channel name */}
              <div className="flex w-44 shrink-0 items-center gap-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate text-sm text-white/80">{row.name}</span>
              </div>

              {/* Progress bar track */}
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barWidth}%`, backgroundColor: row.color, opacity: 0.85 }}
                />
              </div>

              {/* Right side — compare on hover, sessions+pct when idle */}
              <div className="flex w-48 shrink-0 items-center justify-end gap-3">
                {isHovered && hasCompare ? (
                  <>
                    <div className="text-right">
                      <p className="text-[10px] text-text-muted">
                        {compareLabel ?? 'Prior period'}
                      </p>
                      <p className="tabular-nums text-xs font-medium text-white/50">
                        {priorSessions.toLocaleString()}
                      </p>
                    </div>
                    <div className="h-6 w-px bg-white/10" />
                    <div className="text-right">
                      <Delta current={row.sessions} prior={priorSessions} />
                      <p className="tabular-nums text-sm font-semibold text-white">
                        {row.sessions.toLocaleString()}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="tabular-nums text-sm font-semibold text-white">
                      {row.sessions.toLocaleString()}
                    </span>
                    <span className="w-10 text-right text-xs text-text-muted">
                      {row.pct}%
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Source / Medium sub-list — visible on hover */}
            {isHovered && smEntries.length > 0 && (
              <div className="px-2 pb-2.5 pt-0.5">
                <div className="ml-[calc(theme(spacing.44)+theme(spacing.4))] space-y-1.5">
                  {smEntries.map((sm) => {
                    const smBarW = (sm.sessions / smMax) * 100
                    return (
                      <div key={sm.name} className="flex items-center gap-3">
                        {/* Source / medium label */}
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40"
                          title={sm.name}
                        >
                          {sm.name}
                        </span>

                        {/* Mini bar */}
                        <div className="relative h-[3px] w-20 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width:           `${smBarW}%`,
                              backgroundColor: row.color,
                              opacity:         0.5,
                            }}
                          />
                        </div>

                        {/* Session count */}
                        <span className="w-14 shrink-0 text-right tabular-nums text-[11px] text-white/40">
                          {sm.sessions.toLocaleString()}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
