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
import type { DailyFormEntry } from '@/lib/hubspot/client'

const FORM_COLORS = ['#60FF80', '#60FDFF', '#FF9F60', '#C060FF', 'rgba(255,255,255,0.55)', '#FF6060']
const SMOOTH_WINDOW = 7

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

function truncate(s: string, n = 28): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

interface ChartTooltipEntry {
  dataKey?: string | number
  name?:    string
  value?:   number
  color?:   string
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null
  const entries = payload.filter((e) => (e.value ?? 0) > 0)
  if (!entries.length) return null
  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3.5 py-3 shadow-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      {entries.map((e) => (
        <div key={String(e.dataKey)} className="mb-1 flex items-center gap-2 last:mb-0">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="max-w-[180px] truncate text-[13px] text-white/70">{e.name}</span>
          <span className="ml-auto pl-4 text-[13px] font-bold text-white">{(e.value ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

interface FormTrendChartProps {
  topForms: string[]
  days:     DailyFormEntry[]
}

export function FormTrendChart({ topForms, days }: FormTrendChartProps) {
  const [active, setActive] = useState<Record<string, boolean>>(
    () => Object.fromEntries(topForms.map((f) => [f, true]))
  )
  const [smoothed, setSmoothed] = useState(false)

  const toggle = (key: string) => setActive((prev) => ({ ...prev, [key]: !prev[key] }))

  // Flatten DailyFormEntry into flat objects for Recharts
  const flatData: { date: string; [key: string]: string | number }[] =
    days.map((d) => ({ date: d.date, ...d.forms }))

  const chartData = useMemo(() => {
    if (!smoothed) return flatData
    return flatData.map((row, i) => {
      const slice = flatData.slice(Math.max(0, i - SMOOTH_WINDOW + 1), i + 1)
      const smoothed: Record<string, number | string> = { date: row.date }
      for (const f of topForms) {
        const vals = slice.map((r) => (r[f] as number) ?? 0)
        smoothed[f] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length)
      }
      return smoothed
    })
  }, [flatData, smoothed, topForms])

  const hasData = days.some((d) => Object.values(d.forms).some((v) => v > 0))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Submissions Over Time</h3>
          <InlineTooltip text="Daily contact submissions per form (by first-touch form attribution). Shows top forms by volume. Toggle to isolate a form; use 7d avg to smooth daily noise." />
        </div>

        <div className="flex items-center gap-2">
          <ButtonTooltip hint="Smooths each data point into a 7-day rolling average.">
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

          <div className="flex flex-wrap gap-1 rounded-lg bg-white/[0.04] p-1">
            {topForms.map((form, idx) => {
              const color = FORM_COLORS[idx % FORM_COLORS.length]
              const isActive = active[form] ?? true
              return (
                <button
                  key={form}
                  onClick={() => toggle(form)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-150',
                    isActive ? 'bg-white/10 text-white' : 'text-text-muted hover:text-white/60'
                  )}
                  title={form}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color, opacity: isActive ? 1 : 0.35 }}
                  />
                  {truncate(form)}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {!hasData ? (
        <p className="py-12 text-center text-sm italic text-text-muted/50">
          No form submissions in this date range.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              {topForms.map((form, idx) => {
                const color = FORM_COLORS[idx % FORM_COLORS.length]
                const gradId = `form-grad-${idx}`
                return (
                  <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={color} stopOpacity={0}   />
                  </linearGradient>
                )
              })}
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

            {topForms.map((form, idx) =>
              (active[form] ?? true) ? (
                <Area
                  key={form}
                  type="monotone"
                  dataKey={form}
                  name={truncate(form, 40)}
                  stroke={FORM_COLORS[idx % FORM_COLORS.length]}
                  fill={`url(#form-grad-${idx})`}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: FORM_COLORS[idx % FORM_COLORS.length], strokeWidth: 0 }}
                />
              ) : null
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
