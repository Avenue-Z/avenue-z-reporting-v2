'use client'

import { useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { isEmptyTrend } from '@/lib/organic-social/trend-series'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { PostMark } from '@/lib/organic-social/post-marks'
import { NoData } from './no-data'

export const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

// Canonical per-channel color — stable whether a channel is shown alone or with others.
// Exported so the invariant test can prove the all-four case equals the old positional
// lookup and the degraded case intentionally diverges (see render-invariant.test.tsx).
export const CHANNEL_COLOR: Record<string, string> = {
  Instagram: PALETTE[0],
  Facebook: PALETTE[1],
  X: PALETTE[2],
  LinkedIn: PALETTE[3],
}
export const colorFor = (channel: string) => CHANNEL_COLOR[channel] ?? PALETTE[0]

// Exported so the Follower Graph part (M3) reuses the exact same chart + legend, retitled.
// `marks` is optional: a chart given none renders exactly as it did before the prop existed,
// which is what keeps every client still pinned to v1 of these parts unchanged.
export function ChannelTrendChart({
  title, series, marks,
}: { title: string; series: TrendSeries; marks?: PostMark[] }) {
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Marks default ON. They exist to answer "what ran that day" the moment the chart is
  // opened; defaulting them off would mean the feature only helps someone who knows it is
  // there. Only rendered at all when the caller supplies marks.
  const [showMarks, setShowMarks] = useState(true)

  const toggle = (channel: string) =>
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })

  const activeChannels = series.channels.filter((c) => active.has(c))
  const yKeys = activeChannels.map((c) => ({ key: c, label: c, color: colorFor(c) }))
  // Empty-state is evaluated against the ACTIVE selection, not the whole series: toggling off
  // every channel but an all-null one (or off entirely) would otherwise leave niceYDomain
  // undefined → a blank [0,'auto'] axis. Legend stays visible so the user can toggle back on.
  const activeEmpty = isEmptyTrend(series, activeChannels)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
      {isEmptyTrend(series) ? (
        <NoData />
      ) : (
        <>
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
            {marks && marks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMarks((v) => !v)}
                aria-pressed={showMarks}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  showMarks
                    ? 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-text-muted hover:text-white',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: showMarks ? CHART_COLORS.primary : 'transparent', border: `1px solid ${CHART_COLORS.primary}` }}
                />
                Posts
              </button>
            )}
          </div>
          {activeEmpty ? (
            <NoData />
          ) : (
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={showMarks ? marks?.map((m) => ({ x: m.date, label: `${m.count} post${m.count === 1 ? '' : 's'}` })) : undefined}
            />
          )}
        </>
      )}
    </section>
  )
}

export function EngagementTrend({ series, marks }: { series: TrendSeries; marks?: PostMark[] }) {
  return <ChannelTrendChart title="Engagement Over Time" series={series} />
}
