'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ComboChartProps {
  data: Array<Record<string, number | string>>
  xKey: string
  bar: { key: string; color: string; label: string }
  line: { key: string; color: string; label: string }
  valueFormatter?: (n: number) => string
}

export function ComboChart({ data, xKey, bar, line, valueFormatter }: ComboChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : String(v))}
          />
          <Bar yAxisId="left" dataKey={bar.key} name={bar.label} fill={bar.color} radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" dataKey={line.key} name={line.label} stroke={line.color} strokeDasharray="5 4" dot={false} strokeWidth={2} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
