'use client'

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'

interface DonutChartProps {
  data: { name: string; value: number; color: string }[]
  height?: number
}

export function DonutChart({ data, height = 300 }: DonutChartProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={3}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#272727',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: '13px',
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: '#FFFFFF', fontSize: '12px' }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
