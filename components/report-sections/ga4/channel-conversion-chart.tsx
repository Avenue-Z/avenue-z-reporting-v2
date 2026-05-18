'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ChannelConvRow {
  name: string
  sessions: number
  convRate: number // decimal e.g. 0.032
  color: string
}

interface ChannelConversionChartProps {
  data: ChannelConvRow[]
}

export function ChannelConversionChart({ data }: ChannelConversionChartProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (data.length === 0) return null

  const maxConvRate = Math.max(...data.map((d) => d.convRate), 0.001)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Channels by Conversion Rate</h3>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
            ?
          </span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Top channels ranked by conversion rate, not session volume. Reveals which sources bring the highest-quality traffic — a channel driving fewer sessions but converting at 3× the rate is often more valuable than a high-volume channel.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>

      <p className="mb-5 mt-0.5 text-xs text-text-muted">
        Channels with 20+ sessions · ranked by conversion rate
      </p>

      <div className="space-y-2">
        {data.map((d) => {
          const barW     = (d.convRate / maxConvRate) * 100
          const isHov    = hovered === d.name
          const isDimmed = hovered !== null && !isHov

          return (
            <div
              key={d.name}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-1.5 transition-all duration-200',
                isDimmed ? 'opacity-25' : 'opacity-100',
                isHov    ? 'bg-white/[0.03]' : ''
              )}
              onMouseEnter={() => setHovered(d.name)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Color dot + channel name */}
              <div className="flex w-36 shrink-0 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="truncate text-sm text-white/80">{d.name}</span>
              </div>

              {/* Bar — proportional to conv rate */}
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barW}%`, backgroundColor: d.color, opacity: 0.85 }}
                />
              </div>

              {/* Stats */}
              <div className="flex w-44 shrink-0 items-center justify-end gap-3 text-right">
                <div>
                  <p className="text-[10px] text-text-muted">Sessions</p>
                  <p className="tabular-nums text-xs font-medium text-white/60">
                    {d.sessions.toLocaleString()}
                  </p>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div>
                  <p className="text-[10px] text-text-muted">Conv. Rate</p>
                  <p className="tabular-nums text-sm font-bold text-white">
                    {(d.convRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
