'use client'

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface CoverageChartProps {
  data: { date: string; count: number }[]
}

export function CoverageChart({ data }: CoverageChartProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#8A8A8A', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            tickFormatter={(val: string) => {
              const d = new Date(val + 'T00:00:00')
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }}
            interval={4}
          />
          <YAxis
            tick={{ fill: '#8A8A8A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
            labelStyle={{ color: '#8A8A8A', marginBottom: 4 }}
            labelFormatter={(val) => {
              const d = new Date(String(val) + 'T00:00:00')
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            }}
            formatter={(value) => [`${value} article${value !== 1 ? 's' : ''}`, 'Coverage']}
          />
          <Bar
            dataKey="count"
            name="Articles"
            fill={CHART_COLORS.primary}
            radius={[4, 4, 0, 0]}
            maxBarSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
