'use client'

import { useMemo, useState } from 'react'
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

// ── Types ────────────────────────────────────────────────────────────────────

interface TrendRow {
  date:       string
  total:      number
  icp:        number
  mcp:        number
  prevDate?:  string
  prevTotal?: number
  prevIcp?:   number
  prevMcp?:   number
}

type SeriesKey = 'total' | 'icp' | 'mcp'

const PREV_KEY: Record<SeriesKey, keyof TrendRow> = {
  total: 'prevTotal',
  icp:   'prevIcp',
  mcp:   'prevMcp',
}

const SERIES: {
  key:        SeriesKey
  label:      string
  color:      string
  gradientId: string
  hint:       string
}[] = [
  {
    key:        'total',
    label:      'All Contacts',
    color:      'rgba(255,255,255,0.55)',
    gradientId: 'contact-grad-total',
    hint:       'All inbound contacts created from online sources (excluding Offline).',
  },
  {
    key:        'icp',
    label:      'ICP',
    color:      '#60FF80',
    gradientId: 'contact-grad-icp',
    hint:       'Ideal Customer Profile contacts — highest-priority leads based on HubSpot profile scoring.',
  },
  {
    key:        'mcp',
    label:      'MCP',
    color:      '#60FDFF',
    gradientId: 'contact-grad-mcp',
    hint:       'Most Compatible Profile contacts.',
  },
]

const SMOOTH_WINDOW = 7

// ── Sub-components ────────────────────────────────────────────────────────────

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

interface TooltipEntry {
  dataKey?: string | number
  name?:    string
  value?:   number
  color?:   string
  payload?: TrendRow
}

function delta(current: number, prior: number | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((current - prior) / prior) * 100
}

function ChartTooltip({
  active, payload, label, compareLabel,
}: {
  active?:       boolean
  payload?:      TooltipEntry[]
  label?:        string
  compareLabel?: string
}) {
  if (!active || !payload?.length) return null

  const mainEntries = payload.filter((e) =>
    ['total', 'icp', 'mcp'].includes(String(e.dataKey))
  )
  if (!mainEntries.length) return null

  const row        = mainEntries[0]?.payload
  const hasCompare = row?.prevTotal != null

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3.5 py-3 shadow-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {label}
      </p>
      {mainEntries.map((entry) => {
        const key     = String(entry.dataKey) as SeriesKey
        const prevKey = PREV_KEY[key]
        const prev    = row?.[prevKey] as number | undefined
        const d       = delta(entry.value ?? 0, prev)

        return (
          <div key={key} className="mb-1.5 last:mb-0">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-[13px] text-white/70">{entry.name}</span>
              <span className="ml-auto pl-4 text-[13px] font-bold text-white">
                {Number(entry.value ?? 0).toLocaleString()}
              </span>
              {hasCompare && d !== null && (
                <span
                  className="w-14 shrink-0 text-right text-[11px] font-bold"
                  style={{ color: d >= 0 ? '#60FF80' : '#FF4444' }}
                >
                  {d >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
                </span>
              )}
            </div>
            {hasCompare && prev != null && (
              <div className="ml-4 mt-0.5">
                <span className="text-[11px] text-white/25">Prior: {prev.toLocaleString()}</span>
              </div>
            )}
          </div>
        )
      })}
      {hasCompare && row?.prevDate && (
        <p className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] text-white/25">
          vs {row.prevDate}
        </p>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface ContactsTrendChartProps {
  data:          TrendRow[]
  compareLabel?: string
}

export function ContactsTrendChart({ data, compareLabel }: ContactsTrendChartProps) {
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({
    total: true,
    icp:   true,
    mcp:   true,
  })
  const [smoothed, setSmoothed] = useState(false)

  const toggle = (key: SeriesKey) =>
    setActive((prev) => ({ ...prev, [key]: !prev[key] }))

  const chartData = useMemo(() => {
    if (!smoothed) return data
    return data.map((row, i) => {
      const slice    = data.slice(Math.max(0, i - SMOOTH_WINDOW + 1), i + 1)
      const avg      = (key: SeriesKey) =>
        Math.round(slice.reduce((s, r) => s + r[key], 0) / slice.length)
      const avgPrev  = (key: keyof TrendRow) => {
        const vals = slice.map((r) => r[key] as number | undefined).filter((v) => v != null) as number[]
        return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : undefined
      }
      return {
        ...row,
        total:     avg('total'),
        icp:       avg('icp'),
        mcp:       avg('mcp'),
        prevTotal: row.prevTotal != null ? avgPrev('prevTotal') : undefined,
        prevIcp:   row.prevIcp   != null ? avgPrev('prevIcp')   : undefined,
        prevMcp:   row.prevMcp   != null ? avgPrev('prevMcp')   : undefined,
      }
    })
  }, [data, smoothed])

  const hasCompare = data.length > 0 && data[0].prevTotal != null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Contacts Over Time</h3>
          <InlineTooltip text="Daily inbound contacts created from online sources. ICP and MCP reflect profile scoring in HubSpot. Toggle series to isolate segments; use 7d avg to smooth day-to-day noise." />
        </div>

        <div className="flex items-center gap-2">
          <ButtonTooltip hint="Smooths each data point into a 7-day rolling average, making trends easier to read by reducing day-to-day noise.">
            <button
              onClick={() => setSmoothed((v) => !v)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-xs font-semibold transition-all duration-150',
                smoothed
                  ? 'border-white/20 bg-white/10 text-white'
                  : 'border-white/10 bg-white/[0.04] text-text-muted hover:text-white/60'
              )}
            >
              7d avg
            </button>
          </ButtonTooltip>

          <div className="h-4 w-px bg-white/10" />

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
      </div>

      {/* Compare legend */}
      {hasCompare && compareLabel && (
        <div className="mb-3 flex items-center gap-4 text-[11px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <div className="h-[2px] w-5 rounded-full bg-white/50" />
            <span>Current period</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="2" className="overflow-visible">
              <line x1="0" y1="1" x2="20" y2="1" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            <span>{compareLabel}</span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.gradientId} id={s.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={s.color} stopOpacity={0.25} />
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
            content={<ChartTooltip compareLabel={compareLabel} />}
            cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
          />

          {/* Prior period dashed overlays — rendered first so main lines sit on top */}
          {hasCompare && SERIES.map((s) =>
            active[s.key] ? (
              <Area
                key={`${s.key}-prev`}
                type="monotone"
                dataKey={PREV_KEY[s.key] as string}
                stroke={s.color}
                strokeOpacity={0.35}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                fill="none"
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            ) : null
          )}

          {/* Current period main lines */}
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
    </div>
  )
}
