'use client'

import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface LineChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
}

// Auto-scale the Y axis to the data instead of pinning the baseline to 0.
// Recharts' YAxis defaults to [0, 'auto'], so a follower/engagement series that
// sits near the top of a 0→max range reads as a flat line even when it's moving.
// We frame the actual min/max with ~10% headroom and round the ends to a "nice"
// step so ticks stay clean. The axis labels still show true values, so the framing
// is honest — a non-zero baseline is the norm for trend lines (not bars). Clamp the
// floor at 0 for these non-negative count metrics; return undefined for degenerate
// data so Recharts falls back to its own default.
export function niceYDomain(
  data: Record<string, string | number>[],
  yKeys: { key: string }[],
): [number, number] | undefined {
  const values = data
    .flatMap((row) => yKeys.map((k) => Number(row[k.key])))
    .filter((v) => Number.isFinite(v))
  if (values.length === 0) return undefined

  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    // Flat series: pad around the single value so it sits mid-chart, not glued to an edge.
    const p = Math.max(1, Math.abs(min) * 0.05)
    min -= p
    max += p
  }

  const range = max - min
  const step = Math.pow(10, Math.floor(Math.log10(range))) / 2 // half-decade, scales with magnitude
  const pad = range * 0.1
  let lo = Math.floor((min - pad) / step) * step
  const hi = Math.ceil((max + pad) / step) * step
  if (Math.min(...values) >= 0) lo = Math.max(0, lo) // counts never go below 0
  return [lo, hi]
}

export function LineChart({ data, xKey, yKeys, height = 300 }: LineChartProps) {
  const yDomain = niceYDomain(data, yKeys)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#8A8A8A', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
          />
          <YAxis
            domain={yDomain ?? [0, 'auto']}
            allowDecimals={false}
            tick={{ fill: '#8A8A8A', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {yKeys.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label ?? series.key}
              stroke={series.color ?? CHART_COLORS.primary}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  )
}
