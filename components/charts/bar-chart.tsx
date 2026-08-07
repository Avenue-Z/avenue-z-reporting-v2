'use client'

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'
import { usd } from '@/lib/supermetrics/format'
import { money } from '@/lib/paid-media/format'

interface BarChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
  // String descriptor (not a function) so this works when rendered from a Server Component.
  // 'currency' = whole dollars (usd); 'currency-cents' = two-decimal cents, for Paid Media.
  valueFormat?: 'currency' | 'currency-cents'
}

export function BarChart({ data, xKey, yKeys, height = 300, valueFormat }: BarChartProps) {
  const fmt =
    valueFormat === 'currency'
      ? (n: number) => usd(n)
      : valueFormat === 'currency-cents'
        ? (n: number) => money(n)
        : undefined
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#8A8A8A', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#8A8A8A', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmt ? (v) => fmt(Number(v)) : undefined}
          />
          <Tooltip
            formatter={fmt ? (v) => fmt(Number(v)) : undefined}
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
          />
          {yKeys.map((series) => (
            <Bar
              key={series.key}
              dataKey={series.key}
              name={series.label ?? series.key}
              fill={series.color ?? CHART_COLORS.primary}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  )
}
