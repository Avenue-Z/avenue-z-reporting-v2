'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface DeviceRow {
  device: string
  sessions: number
  bounceRate: number
  engagementRate: number
}

interface DeviceBreakdownProps {
  devices: DeviceRow[]
}

const DEVICE_ICONS: Record<string, string> = {
  desktop: '🖥',
  mobile:  '📱',
  other:   '📺',
}

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#3B82F6',
  mobile:  '#22D3EE',
  other:   '#A855F7',
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%` }

export function DeviceBreakdown({ devices }: DeviceBreakdownProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = devices.reduce((s, d) => s + d.sessions, 0) || 1
  const max   = Math.max(...devices.map((d) => d.sessions), 1)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Device Breakdown</h3>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Sessions split by device type. Engagement rate (opposite of bounce rate) shows which device delivers the most quality visits.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>

      {/* Proportional split bar */}
      <div className="mb-5 mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {devices.map((d) => {
          const color = DEVICE_COLORS[d.device.toLowerCase()] ?? '#8A8A8A'
          return (
            <div
              key={d.device}
              className="rounded-full transition-all duration-500"
              style={{
                width:           `${(d.sessions / total) * 100}%`,
                backgroundColor: color,
                opacity:         hovered === null || hovered === d.device ? 0.85 : 0.2,
              }}
            />
          )
        })}
      </div>

      <div className="space-y-2">
        {devices.map((d) => {
          const key      = d.device.toLowerCase()
          const color    = DEVICE_COLORS[key] ?? '#8A8A8A'
          const barW     = (d.sessions / max) * 100
          const share    = Math.round((d.sessions / total) * 100)
          const isHov    = hovered === d.device
          const isDimmed = hovered !== null && !isHov

          return (
            <div
              key={d.device}
              className={cn(
                'flex items-center gap-3 rounded-md px-2 py-1.5 transition-all duration-200',
                isDimmed ? 'opacity-25' : 'opacity-100',
                isHov    ? 'bg-white/[0.03]' : ''
              )}
              onMouseEnter={() => setHovered(d.device)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Label */}
              <div className="flex w-24 shrink-0 items-center gap-2">
                <span className="text-sm">{DEVICE_ICONS[key] ?? '📺'}</span>
                <span className="text-sm capitalize text-white/80">{d.device}</span>
              </div>

              {/* Bar */}
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barW}%`, backgroundColor: color, opacity: 0.85 }}
                />
              </div>

              {/* Stats */}
              <div className="flex w-36 shrink-0 items-center justify-end gap-3 text-right sm:w-44">
                <div>
                  <p className="text-[10px] text-text-muted">Engagement</p>
                  <p className="tabular-nums text-xs font-semibold text-white/70">
                    {fmtPct(d.engagementRate)}
                  </p>
                </div>
                <div className="h-5 w-px bg-white/10" />
                <div>
                  <p className="text-[10px] text-text-muted">{share}%</p>
                  <p className="tabular-nums text-sm font-bold text-white">
                    {d.sessions.toLocaleString()}
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
