'use client'

import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { CHART_COLORS } from '@/lib/constants'

interface TimelineProps {
  data: {
    date: string
    sessions: number
    brandedSearches: number
    revenue: number
    prHit: boolean
  }[]
  prHits: {
    id: string
    date: string
    outlet: string
    headline: string
  }[]
}

export function FFCITimeline({ data, prHits }: TimelineProps) {
  // Find PR hit dates to draw reference lines
  const prDates = data
    .map((d, i) => (d.prHit ? { date: d.date, index: i } : null))
    .filter(Boolean) as { date: string; index: number }[]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-4 flex items-center gap-6 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: CHART_COLORS.ga4 }} />
          Sessions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: CHART_COLORS.primary }} />
          Branded Searches
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: `${CHART_COLORS.positive}40` }} />
          PR Hit
        </span>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ffci-sessions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.ga4} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.ga4} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ffci-searches" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#8A8A8A', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
            tickLine={false}
            interval={4}
          />
          <YAxis
            yAxisId="sessions"
            tick={{ fill: '#8A8A8A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="searches"
            orientation="right"
            tick={{ fill: '#8A8A8A', fontSize: 11 }}
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
            labelStyle={{ color: '#8A8A8A', marginBottom: 4 }}
          />

          {/* PR hit reference lines */}
          {prDates.map((pr, i) => (
            <ReferenceLine
              key={pr.date}
              x={pr.date}
              yAxisId="sessions"
              stroke={CHART_COLORS.positive}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: `PR`,
                position: 'top',
                fill: CHART_COLORS.positive,
                fontSize: 10,
                fontWeight: 700,
              }}
            />
          ))}

          <Area
            yAxisId="sessions"
            type="monotone"
            dataKey="sessions"
            name="Sessions"
            stroke={CHART_COLORS.ga4}
            fill="url(#ffci-sessions)"
            strokeWidth={2}
          />
          <Area
            yAxisId="searches"
            type="monotone"
            dataKey="brandedSearches"
            name="Branded Searches"
            stroke={CHART_COLORS.primary}
            fill="url(#ffci-searches)"
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
