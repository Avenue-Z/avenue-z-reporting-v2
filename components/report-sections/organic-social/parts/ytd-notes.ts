import { getChartNotes } from '@/lib/organic-social/chart-notes/select'
import { notesByDay } from '@/lib/organic-social/chart-notes/pick'
import { noteCapabilities } from '@/lib/organic-social/chart-notes/permissions'
import { notesOn } from '@/lib/organic-social/chart-notes/enabled'
import type { NoteEditorState, YtdNoteChart } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { YtdGraph, YtdMonth } from '@/lib/organic-social/ytd'
import type { OrganicSocialCtx } from '../ctx'

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A month's label as the YTD graphs draw it (ytd.ts, labelOf): its short name, with " (live)" for a month in progress.
 *  A test pins that the two agree. */
export function ytdMonthLabel(m: Pick<YtdMonth, 'key' | 'partial'>): string {
  const short = SHORT[Number(m.key.slice(5, 7)) - 1]
  return m.partial ? `${short} (live)` : short
}

/** One month's note in the panel under a YTD graph. `editor` only for someone who can edit. */
export type YtdNoteRow = { key: string; label: string; text: string | null; editor?: NoteEditorState }
/** What the panel's Add annotation form and buttons need. Editors only. */
export type YtdNoteControls = { clientSlug: string; channel: DashChannel; chart: YtdNoteChart; canApprove: boolean; months: { key: string; label: string }[] }
/** One graph's notes: the hover text by the point's label and a dot per approved note on a point (both only when there
 *  is one, so a graph with none renders exactly as before), and the panel rows. */
export type YtdGraphNotes = { notes?: Record<string, string>; marks?: { x: string }[]; panel: YtdNoteRow[]; controls?: YtdNoteControls }
export type YtdNotes = { followers: YtdGraphNotes; views: YtdGraphNotes }

/** The team's notes for one tab's two YTD graphs (spec 2026-10-06-os-ytd-notes-design.md). Read once, only when notes
 *  are on for the client; a month's note is stored on its 1st, and only months of this block are shown. A viewer who
 *  cannot edit gets approved notes only: on a point of a line, the hover text and a dot; anywhere else (a one-point
 *  year drawn as a bar, a month with no point), a panel line. An editor also gets every noted month in the panel with
 *  its draft and ids, and the controls. Fails closed: a failed read draws the graphs as before, with one log line that
 *  carries no error message and no note text. */
export async function readYtdNotes(
  client: unknown, ctx: OrganicSocialCtx, months: YtdMonth[], graphs: { followers: YtdGraph; views: YtdGraph },
): Promise<YtdNotes | undefined> {
  const { clientSlug, channel } = ctx
  if (!channel || months.length === 0 || !notesOn(client)) return undefined
  const id = (client as { id?: unknown }).id
  if (typeof id !== 'string') return undefined
  let rows: Awaited<ReturnType<typeof getChartNotes>>
  try {
    rows = await getChartNotes(id, channel)
  } catch {
    console.error(`[organic-social] ytd notes unreadable slug=${clientSlug} channel=${channel}; showing none`)
    return undefined
  }
  const caps = noteCapabilities(ctx.role, ctx.email ?? null)
  const labels = new Map(months.map((m) => [m.key, ytdMonthLabel(m)]))
  const from = `${months[0].key}-01`
  const to = `${months[months.length - 1].key}-01`

  const build = (chart: YtdNoteChart, g: YtdGraph): YtdGraphNotes => {
    const line = g.points.length >= 2 // one point is drawn as a bar (ytd-review-sheet.tsx graph())
    const onPoint = new Set(g.points.map((p) => p.key))
    const notes: Record<string, string> = {}
    const marks: { x: string }[] = []
    const panel: YtdNoteRow[] = []
    for (const [day, dn] of notesByDay(rows, { chart, from, to, canEdit: caps.canEdit })) {
      const key = day.slice(0, 7)
      const label = labels.get(key)
      if (!label || day !== `${key}-01`) continue
      const text = dn.approved?.text ?? null
      const hover = text !== null && line && onPoint.has(key)
      if (hover) { notes[label] = text; marks.push({ x: label }) }
      if (dn.editor) panel.push({ key, label, text, editor: dn.editor })
      else if (text !== null && !hover) panel.push({ key, label, text })
    }
    return {
      ...(marks.length > 0 ? { notes, marks } : {}),
      panel,
      ...(caps.canEdit ? { controls: { clientSlug, channel, chart, canApprove: caps.canApprove, months: months.map((m) => ({ key: m.key, label: labels.get(m.key)! })) } } : {}),
    }
  }
  return { followers: build('ytd-followers', graphs.followers), views: build('ytd-views', graphs.views) }
}
