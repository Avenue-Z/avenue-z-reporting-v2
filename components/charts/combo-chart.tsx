'use client'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ComboChartProps<T extends object> {
  data: T[]
  xKey: keyof T & string
  bar: { key: keyof T & string; color: string; label: string }
  line?: { key: keyof T & string; color: string; label: string }
  valueFormatter?: (n: number) => string
  xFormatter?: (v: string) => string
}

export function ComboChart<T extends object>({ data, xKey, bar, line, valueFormatter, xFormatter }: ComboChartProps<T>) {
  const fmtLine = (n: number) => Number(n).toLocaleString()
  const fmtBar = (n: number) => (valueFormatter ? valueFormatter(Number(n)) : fmtLine(n))
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey={xKey} tickFormatter={xFormatter} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tickFormatter={(v) => fmtBar(Number(v))} width={56} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />
          {line && <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtLine(Number(v))} tick={{ fill: '#8A8A8A', fontSize: 11 }} tickLine={false} axisLine={false} />}
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
            formatter={(v, name) => (line && name === line.label ? fmtLine(Number(v)) : fmtBar(Number(v)))}
          />
          <Bar yAxisId="left" dataKey={bar.key} name={bar.label} fill={bar.color} radius={[3, 3, 0, 0]} />
          {line && <Line yAxisId="right" dataKey={line.key} name={line.label} stroke={line.color} strokeDasharray="5 4" dot={false} strokeWidth={2} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
