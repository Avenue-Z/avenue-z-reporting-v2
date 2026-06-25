'use client'

// FB-038: Ranked slope chart for §E "Which pages are gaining momentum
// and which are losing it?".
//
// Layout: 3 toggle buttons (AI Referral Traffic / Organic Search Traffic /
// Citation Share) above a Recharts LineChart. Exactly one toggle is active at
// any time. Switching toggles re-derives the top 15 pages by absolute delta
// of the active metric. Lines are colored by direction (green gainer, red
// loser, gray flat).
//
// Empty state when no comparison period is selected (compareActive=false).

import { useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { computeSlopeChart } from '@/lib/peec/slope-chart'
import type { SlopeChartInput, SlopeMetric } from '@/lib/peec/slope-chart'
import { cn } from '@/lib/utils'

interface Props {
  input: SlopeChartInput
  compareActive: boolean
}

const TOGGLES: { value: SlopeMetric; label: string }[] = [
  { value: 'ai-referral',    label: 'AI Referral Traffic' },
  { value: 'organic',        label: 'Organic Search Traffic' },
  { value: 'citation-share', label: 'Citation Share' },
]

const DIRECTION_COLOR: Record<string, string> = {
  gainer: '#60FF80',
  loser:  '#FF4444',
  flat:   '#888888',
}

export default function SlopeChart({ input, compareActive }: Props) {
  const [metric, setMetric] = useState<SlopeMetric>('ai-referral')

  if (!compareActive) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          Turn on a comparison period from the date picker to see which pages are gaining momentum across periods.
        </p>
      </div>
    )
  }

  const result = computeSlopeChart(metric, input)

  if (result.points.length === 0) {
    return (
      <div className="space-y-3">
        <ToggleRow active={metric} onChange={setMetric} />
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No movers in this metric for the selected periods.
          </p>
        </div>
      </div>
    )
  }

  // Reshape into Recharts row form: one row per period bucket, one numeric
  // field per page (named by url so the dataKey lookups below match).
  const chartData = [
    { period: 'Prior',   ...Object.fromEntries(result.points.map((p) => [p.url, p.prior])) },
    { period: 'Current', ...Object.fromEntries(result.points.map((p) => [p.url, p.current])) },
  ]

  const yTickFormatter = metric === 'citation-share'
    ? (v: number) => `${v.toFixed(1)}%`
    : (v: number) => `${v.toLocaleString()}`

  return (
    <div className="space-y-3">
      <ToggleRow active={metric} onChange={setMetric} />
      <ResponsiveContainer width="100%" height={420}>
        <LineChart data={chartData} margin={{ top: 16, right: 80, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="#FFFFFF14" />
          <XAxis dataKey="period" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
          <YAxis tickFormatter={yTickFormatter} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
            labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
            itemStyle={{ color: '#FFFFFF' }}
            formatter={(value: unknown, name: unknown) => {
              const p = result.points.find((pt) => pt.url === String(name))
              const label = p?.topic ?? String(name)
              return [yTickFormatter(Number(value)), label]
            }}
          />
          {result.points.map((p) => (
            <Line
              key={p.url}
              type="linear"
              dataKey={p.url}
              stroke={DIRECTION_COLOR[p.direction]}
              strokeOpacity={0.7}
              strokeWidth={2}
              dot={{ r: 3, fill: DIRECTION_COLOR[p.direction] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ToggleRow({ active, onChange }: { active: SlopeMetric; onChange: (m: SlopeMetric) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TOGGLES.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
            active === t.value
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-white/10 bg-transparent text-text-muted hover:border-white/20 hover:text-white',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
