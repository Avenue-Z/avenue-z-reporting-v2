'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { isEmptyTrend } from '@/lib/organic-social/trend-series'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'
import { NoData } from './no-data'
import { AnnotationCallouts, CalloutCard } from './annotation-callouts'
import { NoteForm, savedLine, type ExistingNote, type SavedNote } from './note-form'

/** How long the line after a save stays (Phase 2c, D18). */
const SAVED_LINE_MS = 8000

export const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

// Canonical per-channel color — stable whether a channel is shown alone or with others.
// Exported so the invariant test can prove the all-four case equals the old positional
// lookup and the degraded case intentionally diverges (see render-invariant.test.tsx).
export const CHANNEL_COLOR: Record<string, string> = {
  Instagram: PALETTE[0],
  Facebook: PALETTE[1],
  X: PALETTE[2],
  LinkedIn: PALETTE[3],
  TikTok: CHART_COLORS.tiktok,
}
export const colorFor = (channel: string) => CHANNEL_COLOR[channel] ?? PALETTE[0]

// Exported so the Follower Graph part (M3) reuses the exact same chart + legend, retitled.
// `annotations` is optional: a chart given none (or an empty list) renders exactly as it did
// before the prop existed, with no button, no row and no dots. That is what keeps every
// client still pinned to v1 of these parts, Renaissance included, unchanged.
export function ChannelTrendChart({
  title, series, annotations, annotationControls, noteControls,
}: { title: string; series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls }) {
  // This chart's state is per view. The two seeds below run once, on mount, and are never re-run,
  // which is right only because each tab and each month gets its own instance: both report pages
  // wrap the section in a Suspense keyed on the tab and the month (app/dashboard and app/portal
  // .../reports/page.tsx). Keep that key. Without it the legend holds the previous tab's channel,
  // which empties the chart, and the hides below hold the previous view's answer, with nothing on
  // screen looking wrong. `trends.identity.test.tsx` pins both.
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Annotations default ON, as in the deck. Only rendered at all when the caller supplies
  // at least one.
  const [showAnnotations, setShowAnnotations] = useState(true)
  // The Add annotation or Edit form, open above the chart: {} for a new note, or the day and its text.
  const [form, setForm] = useState<{ day?: string; initial?: { text: string; postIds: number[] } } | null>(null)
  // The line after a save (Phase 2c, D18): a save closed the panel and nothing said what happened. Its
  // clock starts with the save itself, and opening the panel again clears it.
  const [saved, setSaved] = useState<SavedNote | null>(null)
  const savedClock = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSaved = (next: SavedNote | null) => {
    if (savedClock.current) clearTimeout(savedClock.current)
    savedClock.current = next ? setTimeout(() => { savedClock.current = null; setSaved(null) }, SAVED_LINE_MS) : null
    setSaved(next)
  }
  useEffect(() => () => { if (savedClock.current) clearTimeout(savedClock.current) }, [])
  // Which days the team has hidden, held here so hiding one takes its dot off the chart in the
  // same click, not on the next server render. Seeded from the server's answer for this view. A
  // new answer under the same key is not picked up, which takes an in-place refresh someone else
  // caused; closing that needs useOptimistic or an override held per day, never one hash over the
  // whole answer, which reverts a hide still in flight (pinned in the same test).
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
  // A dot marks what a client sees: a top day, or a day with an approved note. A draft-only day and a
  // hidden day get none, so the team's chart matches the client's.
  const shown = visible?.filter((a) => !a.hidden && (!a.noteOnly || !!a.note))
  const noted = shown?.filter((a) => a.note)
  const notes = noted && noted.length > 0 ? Object.fromEntries(noted.map((a) => [a.date, a.note!])) : undefined
  // Phase 2b: the graph shows dots only, and each callout's card opens from its dot (hover, focus
  // or tap). A client's list holds only what they may see (the server removes the rest); the team's
  // also holds its hidden and draft days, which the chart draws as faint dots. A callout whose day
  // has no point on the series has no dot, so it stays in the row above the chart.
  const onSeries = new Set(series.points.map((p) => String(p.date)))
  const onChart = visible?.filter((a) => onSeries.has(a.date))
  const inRow = visible?.filter((a) => !onSeries.has(a.date))
  const onEdit = (day: string, initial?: { text: string; postIds: number[] }) => { showSaved(null); setForm({ day, initial }) }
  // This chart's notes by day, for the Add annotation panel (Phase 2c, D19). Only editors receive
  // noteEditor, so a client's map is always empty.
  const existing: Record<string, ExistingNote> = {}
  for (const a of annotations ?? []) {
    const ed = a.noteEditor
    if (!ed || (!ed.approvedId && !ed.draft)) continue
    existing[a.date] = { text: ed.draft?.text ?? a.note ?? '', postIds: ed.draft?.postIds ?? ed.approvedPostIds, draft: !!ed.draft }
  }

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
            {noteControls && noteControls.days.length > 0 && (
              <button
                type="button"
                onClick={() => { showSaved(null); setForm((f) => (f ? null : {})) }}
                aria-expanded={!!form}
                className="no-print flex items-center gap-1.5 rounded-full border border-white/[0.08] px-3 py-1 text-xs font-bold text-text-muted transition-colors hover:text-white"
              >
                Add annotation
              </button>
            )}
          </div>
          {form && noteControls && (
            <NoteForm key={form.day ?? 'new'} controls={noteControls} fixedDay={form.day} initial={form.initial} notes={existing}
              onClose={() => setForm(null)} onSaved={(s) => { setForm(null); showSaved(s) }} />
          )}
          {saved && !form && noteControls && (
            <p role="status" className="no-print text-xs text-text-muted">{savedLine(saved, noteControls.canApprove)}</p>
          )}
          {inRow && inRow.length > 0 && (
            <AnnotationCallouts items={inRow} controls={annotationControls} noteControls={noteControls} onToggle={setHidden} onEdit={onEdit} />
          )}
          {activeEmpty ? (
            <NoData />
          ) : (
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={shown?.map((a) => ({ x: a.date }))}
              notes={notes}
              callouts={onChart && onChart.length > 0
                ? onChart.map((a) => ({
                    x: a.date,
                    label: a.label,
                    muted: !!a.hidden || (!!a.noteOnly && !a.note),
                    content: <CalloutCard annotation={a} controls={annotationControls} noteControls={noteControls} onToggle={setHidden} onEdit={onEdit} />,
                  }))
                : undefined}
            />
          )}
        </>
      )}
    </section>
  )
}

export function EngagementTrend({
  series, annotations, annotationControls, noteControls, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} />
}
