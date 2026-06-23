'use client'
import { useState } from 'react'
import { ComboChart } from '@/components/charts/combo-chart'
import { CHART_COLORS } from '@/lib/constants'
import { usd, num } from '@/lib/supermetrics/format'
import { weekLabel } from '@/lib/paid-search/week-label'
import type { HeroPoint } from '@/lib/paid-search/types'

const METRICS = [
  { key: 'cost', label: 'Cost' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'leads', label: 'Leads' },
] as const

export function Hero({ points }: { points: HeroPoint[] }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('cost')
  return (
    <section className="space-y-3">
      <div className="flex gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-md px-3 py-1 text-xs ${
              metric === m.key
                ? 'bg-white/10 text-white'
                : 'text-text-muted hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <ComboChart
        data={points}
        xKey="week"
        xFormatter={weekLabel}
        valueFormatter={metric === 'cost' ? usd : num}
        bar={{
          key: metric,
          color: CHART_COLORS.googleAds,
          label: METRICS.find((m) => m.key === metric)!.label,
        }}
        line={{ key: 'leads', color: CHART_COLORS.primary, label: 'Leads' }}
      />
    </section>
  )
}
