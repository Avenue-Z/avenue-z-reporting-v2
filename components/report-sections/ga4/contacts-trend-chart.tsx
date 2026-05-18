'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { cn } from '@/lib/utils'
import type { DailyContactEntry } from '@/lib/hubspot/client'

type SeriesKey = 'total' | 'icp' | 'mcp'

const SERIES: { key: SeriesKey; label: string; color: string; gradientId: string; hint: string }[] = [
  {
    key:        'total',
    label:      'All Contacts',
    color:      'rgba(255,255,255,0.45)',
    gradientId: 'contact-grad-total',
    hint:       'All inbound contacts created each day — online sources only, excluding Offline.',
  },
  {
    key:        'icp',
    label:      'ICP',
    color:      '#60FF80',
    gradientId: 'contact-grad-icp',
    hint:       'Ideal Customer Profile contacts — the highest-priority leads.',
  },
  {
    key:        'mcp',
    label:      'MCP',
    color:      '#60FDFF',
    gradientId: 'contact-grad-mcp',
    hint:       'Most Compatible Profile contacts.',
  },
]

function ButtonTooltip({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className="group relative">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-md border border-white/[0.08] bg-[#1e1e1e] px-3 py-2 text-[11px] leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {hint}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

function InlineTooltip({ text }: { text: string }) {
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

interface ChartTooltipEntry {
  dataKey?: string | number
  name?: string
  value?: number
  color?: string
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null
  const entries = payload.filter((e) => (e.value ?? 0) > 0 || ['total', 'icp', 'mcp'].includes(String(e.dataKey)))
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3.5 py-3 shadow-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      {entries.map((e) => (
        <div key={String(e.dataKey)} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="text-[13px] text-white/70">{e.name}</span>
          <span className="ml-auto pl-4 text-[13px] font-bold text-white">{(e.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

interface ContactsTrendChartProps {
  data: DailyContactEntry[]
}

export function ContactsTrendChart({ data }: ContactsTrendChartProps) {
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({
    total: true,
    icp:   true,
    mcp:   true,
  })

  const toggle = (key: SeriesKey) =>
    setActive((prev) => ({ ...prev, [key]: !prev[key] }))

  const hasData = data.some((d) => d.total > 0)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Contacts Created Over Time</h3>
          <InlineTooltip text="Daily inbound contacts created from online sources. ICP and MCP segments reflect profile scoring in HubSpot. Data is YTD — only days within the selected date range are shown." />
        </div>

        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {SERIES.map((s) => (
            <ButtonTooltip key={s.key} hint={s.hint}>
              <button
                onClick={() => toggle(s.key)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all duration-150',
                  active[s.key] ? 'bg-white/10 text-white' : 'text-text-muted hover:text-white/60'
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full transition-opacity"
                  style={{ backgroundColor: s.color, opacity: active[s.key] ? 1 : 0.35 }}
                />
                {s.label}
              </button>
            </ButtonTooltip>
          ))}
        </div>
      </div>

      {!hasData ? (
        <p className="py-12 text-center text-sm italic text-text-muted/50">
          No contact data available for this date range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.gradientId} id={s.gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={s.color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#8A8A8A', fontSize: 12 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#8A8A8A', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
            />

            {SERIES.map((s) =>
              active[s.key] ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  fill={`url(#${s.gradientId})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: s.color, strokeWidth: 0 }}
                />
              ) : null
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
