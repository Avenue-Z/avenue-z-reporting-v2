// lib/organic-social/social-listening/notes.ts
// Notes on the Social Listening line graphs (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit E;
// spec F6: "if we don't have anything to say it would still look normal, similar to what we did in the year-to-date
// graphs"). They live in chart_notes (lib/db/schema.ts) with the same draft and approve steps as the Organic Social notes,
// under their own channel value and one chart value per graph, so the Organic Social key checks (CHANNELS,
// ANNOTATION_CHARTS, YTD_NOTE_CHARTS) stay exactly as they are and can never accept one. A day note sits on Results over
// time; a month note on a year to date graph, stored on the month's 1st as the YTD Review notes are. Pure, no I/O.
import { isRealDay } from '../annotation-hides/mutations'
import { NOTE_MAX_CHARS } from '../chart-notes/limits'
import { notesByDay } from '../chart-notes/pick'
import { hasControl } from '../chart-notes/validate'
import type { ChartNote } from '@/lib/db/schema'
import type { NoteChart } from '../annotations'
import { isSlMonthNoteChart, isSlNoteChart, SL_NOTES_CHANNEL, slNoteLabel, type SlChartNotes, type SlNoteChart, type SlNoteMark, type SlNoteRow } from './notes-keys'

export { SL_NOTES_CHANNEL, SL_DAY_NOTE_CHARTS, SL_MONTH_NOTE_CHARTS, isSlNoteChart, isSlMonthNoteChart, slNoteLabel } from './notes-keys'
export type { SlNoteChart, SlNoteMark, SlNoteRow, SlNoteControls, SlChartNotes } from './notes-keys'

type Check = { ok: true } | { ok: false; error: string }

/** The save action's payload for a Social Listening note, checked in the order the Organic Social notes check theirs
 *  (chart-notes/validate.ts): channel, chart, day, then the text. The text rules are the same (1 to NOTE_MAX_CHARS
 *  characters, one line); a Social Listening graph has no posts to picture, so `postIds` must be an empty list. */
export function checkSlNoteInput(
  input: { channel: unknown; chart: unknown; day: unknown; body: unknown; postIds: unknown },
  today: string,
): Check {
  if (input.channel !== SL_NOTES_CHANNEL) return { ok: false, error: 'invalid channel' }
  if (!isSlNoteChart(input.chart)) return { ok: false, error: 'invalid chart' }
  if (typeof input.day !== 'string' || !isRealDay(input.day)) return { ok: false, error: 'invalid day' }
  if (isSlMonthNoteChart(input.chart) && !input.day.endsWith('-01')) return { ok: false, error: 'invalid day' }
  if (input.day > today) return { ok: false, error: 'That day has not happened yet.' }
  if (typeof input.body !== 'string') return { ok: false, error: 'invalid note' }
  const body = input.body.trim()
  const chars = [...body].length
  if (chars < 1 || chars > NOTE_MAX_CHARS) return { ok: false, error: `A note is 1 to ${NOTE_MAX_CHARS} characters.` }
  if (hasControl(body)) return { ok: false, error: 'A note is one line of plain text.' }
  if (!Array.isArray(input.postIds) || input.postIds.length > 0) return { ok: false, error: 'A note on a Social Listening graph has no posts.' }
  return { ok: true }
}

/** The earliest day a note may sit on: a day graph draws only reporting months, so the first reporting month's 1st; a
 *  year to date graph draws January onward, so January 1 of that month's year (as the YTD Review notes,
 *  app/actions/chart-notes.ts). A note before it would be an orphan no view reaches. */
export function slNoteEarliest(chart: SlNoteChart, firstMonth: string): string {
  return isSlMonthNoteChart(chart) ? `${firstMonth.slice(0, 4)}-01-01` : `${firstMonth}-01`
}

type Row = Pick<ChartNote, 'id' | 'chart' | 'day' | 'body' | 'postIds' | 'status' | 'approvedAt' | 'updatedAt' | 'deletedAt'>

/** What the section reads once and hands the pages: every live Social Listening note of the client, what this viewer may
 *  do (none for a client, a preview or the PDF), and today's UTC date, which bounds the form. */
export type SlNoteSource = { rows: readonly Row[]; caps: { canEdit: boolean; canApprove: boolean }; clientSlug: string; today: string }

/** One graph's notes from the rows read for the client. `keys` are what the graph draws, in order: its days (yyyy-mm-dd)
 *  or its months (yyyy-mm). Only those are shown. A viewer who cannot edit gets approved notes only, as marks; an editor
 *  also gets every noted key with its draft (notesByDay, the Organic Social rule) and the options the form offers, which
 *  stop at today as the action does. */
export function buildSlChartNotes(rows: readonly Row[], o: {
  chart: SlNoteChart; keys: readonly string[]; caps: { canEdit: boolean; canApprove: boolean }; clientSlug: string; today: string
}): SlChartNotes {
  const month = isSlMonthNoteChart(o.chart)
  const dayOf = (key: string) => (month ? `${key}-01` : key)
  const drawn = new Set(o.keys)
  const marks: SlNoteMark[] = []
  const panel: SlNoteRow[] = []
  if (o.keys.length > 0) {
    // notesByDay compares the chart value as text; a Social Listening chart is not one of its NoteChart names.
    const byDay = notesByDay([...rows], { chart: o.chart as string as NoteChart, from: dayOf(o.keys[0]), to: dayOf(o.keys[o.keys.length - 1]), canEdit: o.caps.canEdit })
    for (const [day, dn] of byDay) {
      const key = month ? day.slice(0, 7) : day
      if (!drawn.has(key) || dayOf(key) !== day) continue
      const label = slNoteLabel(key)
      const text = dn.approved?.text ?? null
      const n = text !== null ? marks.length + 1 : null
      if (text !== null) marks.push({ at: key, n: n!, label, text })
      if (dn.editor) panel.push({ key, label, n, text, editor: dn.editor })
    }
  }
  return {
    marks,
    panel,
    ...(o.caps.canEdit
      ? { controls: { clientSlug: o.clientSlug, chart: o.chart, canApprove: o.caps.canApprove, options: o.keys.filter((k) => dayOf(k) <= o.today).map((k) => ({ key: k, label: slNoteLabel(k) })) } }
      : {}),
  }
}
