'use client'

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import { CHART_COLORS, formatChartNumber } from '@/lib/constants'

export interface BarChartReferenceLine {
  value: number
  color: string
  label?: string
}

interface BarChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  /** Pixel number (existing report sections) or Recharts percentage literal
   *  (e.g. "100%") so dashboard block bodies can fill the RGL grid cell. */
  height?: number | `${number}%`
  /** 'vertical' (default, today's behavior): categories on X, values on Y.
   *  'horizontal': categories on Y, values on X. */
  orientation?: 'horizontal' | 'vertical'
  /** Value-axis reference lines (drawn on the value axis regardless of orientation). */
  referenceLines?: BarChartReferenceLine[]
  /** When true, skip the outer bordered card div and render only the ResponsiveContainer.
   *  Use in block bodies that already supply their own card chrome. */
  unwrapped?: boolean
}

export function BarChart({
  data,
  xKey,
  yKeys,
  height = 300,
  orientation = 'vertical',
  referenceLines = [],
  unwrapped = false,
}: BarChartProps) {
  const horizontal = orientation === 'horizontal'
  // In Recharts, `layout="vertical"` produces horizontal bars (value on X is the bar length).
  // Naming is famously confusing; we map our external prop to Recharts' internal:
  const rechartsLayout = horizontal ? 'vertical' : 'horizontal'

  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} layout={rechartsLayout} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        {horizontal
          ? <YAxis dataKey={xKey} type="category" tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} width={140} />
          : <XAxis dataKey={xKey} tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} />}
        {horizontal
          ? <XAxis type="number" tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} tickFormatter={(v) => formatChartNumber(v)} />
          : <YAxis tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatChartNumber(v)} />}
        <Tooltip
          formatter={(value) => formatChartNumber(value as number)}
          contentStyle={{
            background: '#272727',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            color: '#FFFFFF',
            fontSize: '13px',
          }}
        />
        {yKeys.length > 1 && (
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        )}
        {yKeys.map((series) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={series.label ?? series.key}
            fill={series.color ?? CHART_COLORS.primary}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          />
        ))}
        {referenceLines.map((rl, i) => (
          // On horizontal bars, reference line goes on X axis (value axis); on vertical, on Y.
          horizontal
            ? <ReferenceLine key={`rl-${i}`} x={rl.value} stroke={rl.color} strokeDasharray="4 2" label={rl.label ? { value: rl.label, fill: rl.color, fontSize: 11, position: 'top' } : undefined} />
            : <ReferenceLine key={`rl-${i}`} y={rl.value} stroke={rl.color} strokeDasharray="4 2" label={rl.label ? { value: rl.label, fill: rl.color, fontSize: 11, position: 'right' } : undefined} />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  )

  if (unwrapped) return chart

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {chart}
    </div>
  )
}
