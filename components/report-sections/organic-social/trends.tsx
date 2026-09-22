'use client'

import { useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { isEmptyTrend } from '@/lib/organic-social/trend-series'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation } from '@/lib/organic-social/annotations'
import { NoData } from './no-data'
import { AnnotationCallouts } from './annotation-callouts'

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
// `annotations` is optional: a chart given none (or an empty list) renders exactly as it did
// before the prop existed, with no button, no row and no dots. That is what keeps every
// client still pinned to v1 of these parts, Renaissance included, unchanged.
export function ChannelTrendChart({
  title, series, annotations, annotationControls,
}: { title: string; series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls }) {
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Annotations default ON, as in the deck. Only rendered at all when the caller supplies
  // at least one.
  const [showAnnotations, setShowAnnotations] = useState(true)
  // Which days the team has hidden, held here so hiding one takes its dot off the chart in the
  // same click, not on the next server render. Seeded from the server's answer.
  const [hiddenDays, setHiddenDays] = useState<Set<string>>(() => new Set((annotations ?? []).filter((a) => a.hidden).map((a) => a.date)))
  const setHidden = (day: string, hidden: boolean) => setHiddenDays((days) => {
    const next = new Set(days)
    if (hidden) next.add(day)
    else next.delete(day)
    return next
  })

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
  const hasAnnotations = !!annotations && annotations.length > 0
  const current = annotations?.map((a) => ({ ...a, hidden: hiddenDays.has(a.date) }))
  // Annotations explain the line, so they go when the line does (every channel toggled off).
  const visible = hasAnnotations && showAnnotations && !activeEmpty ? current : undefined

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
            {hasAnnotations && (
              <button
                type="button"
                onClick={() => setShowAnnotations((v) => !v)}
                aria-pressed={showAnnotations}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  showAnnotations
                    ? 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-text-muted hover:text-white',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: showAnnotations ? CHART_COLORS.primary : 'transparent', border: `1px solid ${CHART_COLORS.primary}` }}
                />
                Annotations
              </button>
            )}
          </div>
          {visible && <AnnotationCallouts items={visible} controls={annotationControls} onToggle={setHidden} />}
          {activeEmpty ? (
            <NoData />
          ) : (
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={visible?.filter((a) => !a.hidden).map((a) => ({ x: a.date }))}
            />
          )}
        </>
      )}
    </section>
  )
}

export function EngagementTrend({
  series, annotations, annotationControls, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} annotationControls={annotationControls} />
}
