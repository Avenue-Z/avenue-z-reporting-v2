'use client'
import { useState } from 'react'
import { AreaChart } from '@/components/charts/area-chart'
import { CHART_COLORS } from '@/lib/constants'
import type { ChannelKey } from '@/lib/paid-media/overview'
import type { PaidMediaTrend } from '@/lib/paid-media/trend'

const CHANNEL_META: Record<ChannelKey, { label: string; color: string }> = {
  'paid-search': { label: 'Paid Search', color: CHART_COLORS.googleAds },
  meta: { label: 'Meta', color: CHART_COLORS.metaAds },
  linkedin: { label: 'LinkedIn', color: CHART_COLORS.linkedin },
}

export function PaidMediaTrendChart({ trend }: { trend: PaidMediaTrend }) {
  const [metric, setMetric] = useState<'spend' | 'clicks'>('spend')

  if (trend.points.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
        No trend data for this period.
      </div>
    )
  }

  const data = trend.points.map((p) => {
    const row: Record<string, string | number> = { week: p.label }
    for (const key of trend.channels) row[CHANNEL_META[key].label] = p.channels[key]?.[metric] ?? 0
    return row
  })
  const yKeys = trend.channels.map((key) => ({ key: CHANNEL_META[key].label, color: CHANNEL_META[key].color, label: CHANNEL_META[key].label }))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Trend</p>
        <div className="flex gap-1">
          {(['spend', 'clicks'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                metric === m
                  ? 'rounded-md bg-white/10 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-md px-3 py-1 text-xs text-text-muted transition-colors hover:bg-white/10 hover:text-white'
              }
            >
              {m === 'spend' ? 'Spend' : 'Clicks'}
            </button>
          ))}
        </div>
      </div>
      <AreaChart
        stacked
        data={data}
        xKey="week"
        yKeys={yKeys}
        valueFormat={metric === 'spend' ? 'currency-cents' : undefined}
      />
      <p className="text-xs text-text-muted">
        Stacked by channel. Clicks are link clicks for Meta and all clicks for Paid Search and LinkedIn.
      </p>
    </div>
  )
}
