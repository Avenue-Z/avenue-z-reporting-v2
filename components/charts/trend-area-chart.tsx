// components/charts/trend-area-chart.tsx
'use client'

import { useId } from 'react'
import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART_COLORS, formatChartNumber } from '@/lib/constants'

export interface TrendSeries {
  key: string
  label: string
  color?: string
}

interface TrendAreaChartProps {
  data: Record<string, string | number>[]
  xKey: string
  series: TrendSeries[]
  /** series key → prior-value key, for the dashed overlay + tooltip delta. */
  compareKeys?: Record<string, string>
  xTickFormatter?: (raw: string) => string
  height?: number | `${number}%`
}

interface TooltipEntry {
  dataKey?: string | number
  name?: string
  value?: number
  color?: string
  payload?: Record<string, number | string>
}

function pctDelta(current: number, prior: number | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((current - prior) / prior) * 100
}

function TrendTooltip({
  active, payload, label, series, compareKeys,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
  series: TrendSeries[]
  compareKeys: Record<string, string>
}) {
  if (!active || !payload?.length) return null
  const keys = series.map((s) => s.key)
  const mainEntries = payload.filter((e) => keys.includes(String(e.dataKey)))
  if (!mainEntries.length) return null
  const row = mainEntries[0]?.payload

  return (
    <div className="rounded-lg border border-white/[0.08] bg-[#1e1e1e] px-3.5 py-3 shadow-2xl">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      {mainEntries.map((entry) => {
        const key = String(entry.dataKey)
        const prevKey = compareKeys[key]
        const prev = prevKey && row ? (row[prevKey] as number | undefined) : undefined
        const d = pctDelta(entry.value ?? 0, prev)
        return (
          <div key={key} className="mb-1.5 flex items-center gap-2 last:mb-0">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[13px] text-white/70">{entry.name}</span>
            <span className="ml-auto pl-4 text-[13px] font-bold text-white">
              {Number(entry.value ?? 0).toLocaleString()}
            </span>
            {d !== null && (
              <span className="w-14 shrink-0 text-right text-[11px] font-bold" style={{ color: d >= 0 ? CHART_COLORS.positive : CHART_COLORS.negative }}>
                {d >= 0 ? '↑' : '↓'} {Math.abs(d).toFixed(1)}%
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Generic polished trend area chart — the reporting "trend" look
 *  (cf. ga4/sessions-trend-chart) as a reusable primitive. Caller supplies the
 *  card chrome via <ChartCard>. Single- or multi-series; dashed prior overlay
 *  for any series with a compareKeys entry. */
export function TrendAreaChart({
  data,
  xKey,
  series,
  compareKeys = {},
  xTickFormatter,
  height = 300,
}: TrendAreaChartProps) {
  const gradPrefix = useId()
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          {series.map((s, i) => {
            const color = s.color ?? CHART_COLORS.primary
            return (
              <linearGradient key={s.key} id={`${gradPrefix}-trend-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#8A8A8A', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          tickLine={false}
          tickFormatter={xTickFormatter}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => formatChartNumber(v)} />
        <Tooltip content={<TrendTooltip series={series} compareKeys={compareKeys} />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />

        {/* Prior-period dashed overlays first, so main lines sit on top */}
        {series.map((s) => {
          const prevKey = compareKeys[s.key]
          if (!prevKey) return null
          const color = s.color ?? CHART_COLORS.primary
          return (
            <Area key={`${s.key}-prev`} type="monotone" dataKey={prevKey} stroke={color} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" fill="none" dot={false} activeDot={false} isAnimationActive={false} />
          )
        })}

        {/* Current-period main areas */}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? CHART_COLORS.primary} fill={`url(#${gradPrefix}-trend-grad-${i})`} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: s.color ?? CHART_COLORS.primary, strokeWidth: 0 }} />
        ))}
      </RechartsAreaChart>
    </ResponsiveContainer>
  )
}
