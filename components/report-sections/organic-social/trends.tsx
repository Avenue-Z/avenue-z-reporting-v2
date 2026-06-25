'use client'

import { useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { TrendSeries } from '@/lib/organic-social/types'

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

function ChannelTrendChart({ title, series }: { title: string; series: TrendSeries }) {
  const colorFor = (channel: string) => PALETTE[series.channels.indexOf(channel) % PALETTE.length]
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))

  const toggle = (channel: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })

  const yKeys = series.channels
    .filter((c) => active.has(c))
    .map((c) => ({ key: c, label: c, color: colorFor(c) }))

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {series.channels.map((c) => {
          const on = active.has(c)
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggle(c)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                on
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] text-text-muted hover:text-white',
              )}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: on ? colorFor(c) : 'transparent', border: `1px solid ${colorFor(c)}` }}
              />
              {c}
            </button>
          )
        })}
      </div>
      <LineChart data={series.points} xKey="date" yKeys={yKeys} />
    </section>
  )
}

export function EngagementTrend({ series }: { series: TrendSeries }) {
  return <ChannelTrendChart title="Engagement Over Time" series={series} />
}
