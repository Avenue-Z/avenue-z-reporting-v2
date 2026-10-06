'use client'

import { useEffect, useRef, useState } from 'react'
import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { isEmptyTrend } from '@/lib/organic-social/trend-series'
import type { TrendSeries } from '@/lib/organic-social/types'
import { isClientVisible, type AnnotationControls, type ChartAnnotation, type NoteControls } from '@/lib/organic-social/annotations'
import { NoData } from './no-data'
import { AnnotationCallouts, CalloutCard } from './annotation-callouts'
import { NoteForm, savedLine, type ExistingNote, type SavedNote } from './note-form'
import { ExportAnnotationList } from './export-annotations'
import { useExportMode } from '@/components/export/export-mode'

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

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key)

/** The overrides a new answer does not yet agree with. A day missing from the answer keeps its override. */
function dropAgreed(overrides: Record<string, boolean>, annotations: ChartAnnotation[] | undefined): Record<string, boolean> {
  const server = new Map((annotations ?? []).map((a) => [a.date, !!a.hidden] as const))
  const keep = Object.entries(overrides).filter(([day, hidden]) => server.get(day) !== hidden)
  return keep.length === Object.keys(overrides).length ? overrides : Object.fromEntries(keep)
}

// Exported so the Follower Graph part (M3) reuses the exact same chart + legend, retitled.
// `annotations` is optional: a chart given none (or an empty list) renders exactly as it did
// before the prop existed, with no button, no row and no dots. That is what keeps every
// client still pinned to v1 of these parts, Renaissance included, unchanged.
export function ChannelTrendChart({
  title, series, annotations, annotationControls, noteControls,
}: { title: string; series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls }) {
  // This chart's state is per view: each tab and each month gets its own instance, because both report
  // pages wrap the section in a Suspense keyed on the tab and the month (app/dashboard and app/portal
  // .../reports/page.tsx). Keep that key. The legend below is seeded once, on mount, so without the key it
  // would hold the previous tab's channel and empty the chart. Hides and just-saved notes follow the
  // server's answer per day, including a new answer under the same key. `trends.identity.test.tsx` pins it.
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Annotations default ON, as in the deck. Only rendered at all when the caller supplies
  // at least one.
  const [showAnnotations, setShowAnnotations] = useState(true)
  // In the PDF export the chart is static: every channel, the annotations a client sees, no editors.
  const exportMode = useExportMode()
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
  // A hide the team clicked here, per day, so it takes its dot off the chart in the same click rather than
  // on the next server render (#277). Every other day reads the server's answer, so a day that arrives
  // hidden in an in-place refresh, or another member's hide, is drawn as it is. A day's override is dropped
  // once an answer agrees with it, and only then: an answer can be older than a hide still in flight, so
  // disagreement never reverts one (pinned in the same test). Never one hash over the whole answer.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  // `null` (a write that failed) drops the day's override rather than setting the old value, so the day
  // follows the server again and a later hide by someone else is drawn.
  const setHidden = (day: string, hidden: boolean | null) => setOverrides((o) => {
    if (hidden !== null) return { ...o, [day]: hidden }
    if (!hasOwn(o, day)) return o
    const rest = { ...o }
    delete rest[day]
    return rest
  })
  // Notes saved on this page since the last answer, per day (#276). The save refreshes the page in the
  // background; until that answer arrives, the Add annotation panel and a card's Edit read these, so a
  // second save on that day is the update it is. Any new answer already reflects them, so it clears them.
  const [justSaved, setJustSaved] = useState<Record<string, ExistingNote>>({})
  // The answer these were reconciled against. A new one is a new render from the server (a refresh or
  // navigation under the same key), since the props of a client component keep their identity otherwise.
  const [answer, setAnswer] = useState(annotations)
  if (annotations !== answer) {
    setAnswer(annotations)
    setOverrides((o) => dropAgreed(o, annotations))
    setJustSaved((j) => (Object.keys(j).length > 0 ? {} : j))
  }

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
  // Each card's annotation as drawn: hides follow the override above, and a day with a note saved here whose
  // refreshed answer has not arrived is marked, so its card's Approve, Revoke and Delete wait (Paul, #283).
  const current = annotations?.map((a) => ({
    ...a, hidden: hasOwn(overrides, a.date) ? overrides[a.date] : !!a.hidden,
    ...(hasOwn(justSaved, a.date) ? { noteSaving: true as const } : {}),
  }))
  // Annotations explain the line, so they go when the line does (every channel toggled off).
  const visible = hasAnnotations && showAnnotations && !activeEmpty ? current : undefined
  // A dot marks what a client sees: a top day, or a day with an approved note. A draft-only day and a
  // hidden day get none, so the team's chart matches the client's.
  const shown = visible?.filter(isClientVisible)
  const noted = shown?.filter((a) => a.note)
  const notes = noted && noted.length > 0 ? Object.fromEntries(noted.map((a) => [a.date, a.note!])) : undefined
  // Phase 2b: the graph shows dots only, and each callout's card opens from its dot (hover, focus
  // or tap). A client's list holds only what they may see (the server removes the rest); the team's
  // also holds its hidden and draft days, which the chart draws as faint dots. A callout whose day
  // has no point on the series has no dot, so it stays in the row above the chart.
  const onSeries = new Set(series.points.map((p) => String(p.date)))
  const onChart = visible?.filter((a) => onSeries.has(a.date))
  const inRow = visible?.filter((a) => !onSeries.has(a.date))
  const onEdit = (day: string, initial?: { text: string; postIds: number[] }) => {
    showSaved(null)
    const mine = justSaved[day]
    setForm({ day, initial: mine ? { text: mine.text, postIds: mine.postIds } : initial })
  }
  // This chart's notes by day, for the Add annotation panel (Phase 2c, D19). Only editors receive
  // noteEditor, so a client's map is always empty.
  const existing: Record<string, ExistingNote> = {}
  for (const a of annotations ?? []) {
    const ed = a.noteEditor
    if (!ed || (!ed.approvedId && !ed.draft)) continue
    existing[a.date] = { text: ed.draft?.text ?? a.note ?? '', postIds: ed.draft?.postIds ?? ed.approvedPostIds, draft: !!ed.draft }
  }
  for (const [day, note] of Object.entries(justSaved)) existing[day] = note

  if (exportMode) return <ExportChannelTrendChart title={title} series={series} annotations={annotations} />

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
              onClose={() => setForm(null)} onSaved={(s) => {
                setForm(null)
                showSaved(s)
                setJustSaved((j) => ({ ...j, [s.day]: { text: s.text, postIds: s.postIds, draft: true } }))
              }} />
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
              xFormat="month-day"
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

/** The chart as the PDF export prints it (spec 2026-10-06 §7): title, legend and chart as one unbreakable
 *  block; the annotations a client sees, numbered in date order, as a mark at each day's point and a list
 *  under the chart. No hover cards, toggles or note editors. */
function ExportChannelTrendChart({ title, series, annotations }: { title: string; series: TrendSeries; annotations?: ChartAnnotation[] }) {
  const printable = (annotations ?? []).filter(isClientVisible).sort((a, b) => a.date.localeCompare(b.date))
  const onSeries = new Set(series.points.map((p) => String(p.date)))
  const marks = printable.flatMap((a, i) => (onSeries.has(a.date) ? [{ x: a.date, label: String(i + 1) }] : []))
  const yKeys = series.channels.map((c) => ({ key: c, label: c, color: colorFor(c) }))
  return (
    <section className="space-y-3">
      <div data-export-block="" className="space-y-3">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
        {isEmptyTrend(series) ? <NoData /> : (
          <>
            <div className="flex flex-wrap gap-2">
              {series.channels.map((c) => (
                <span key={c} className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(c) }} />
                  {c}
                </span>
              ))}
            </div>
            <LineChart data={series.points} xKey="date" yKeys={yKeys} marks={marks} xFormat="month-day" />
          </>
        )}
      </div>
      {printable.length > 0 && !isEmptyTrend(series) && <ExportAnnotationList items={printable} />}
    </section>
  )
}

export function EngagementTrend({
  series, annotations, annotationControls, noteControls, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} />
}
