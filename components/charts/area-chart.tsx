'use client'

import {
  ResponsiveContainer,
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface AreaChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  height?: number
}

export function AreaChart({ data, xKey, yKeys, height = 300 }: AreaChartProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {yKeys.map((series, i) => {
              const color = series.color ?? CHART_COLORS.primary
              return (
                <linearGradient
                  key={series.key}
                  id={`gradient-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
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
          />
          <YAxis
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
          {yKeys.map((series, i) => (
            <Area
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label ?? series.key}
              stroke={series.color ?? CHART_COLORS.primary}
              fill={`url(#gradient-${i})`}
              strokeWidth={2}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}
