// lib/organic-social/social-listening/notes-keys.ts
// The names and shapes of the Social Listening notes (plan 2026-11-24, Unit E), apart from their checks and reads, so the
// notes panel in the browser can use them without pulling in anything that reaches the database (notes.ts imports the
// Organic Social note checks, which import the annotation mutations and the database client). Pure, no imports of code.
import type { NoteEditorState } from '../annotations'

/** The channel value every Social Listening note is stored under. Never a Dash channel. */
export const SL_NOTES_CHANNEL = 'SOCIAL_LISTENING'
/** Results over time, brand and industry: a note on a day. */
export const SL_DAY_NOTE_CHARTS = ['sl-b-daily', 'sl-i-daily'] as const
/** The brand year to date graphs: a note on a month (its 1st). */
export const SL_MONTH_NOTE_CHARTS = ['sl-b-ytd', 'sl-b-posneu', 'sl-b-reddit'] as const
export type SlNoteChart = (typeof SL_DAY_NOTE_CHARTS)[number] | (typeof SL_MONTH_NOTE_CHARTS)[number]

const DAY_CHARTS = new Set<string>(SL_DAY_NOTE_CHARTS)
const MONTH_CHARTS = new Set<string>(SL_MONTH_NOTE_CHARTS)

export function isSlNoteChart(chart: unknown): chart is SlNoteChart {
  return typeof chart === 'string' && (DAY_CHARTS.has(chart) || MONTH_CHARTS.has(chart))
}
export function isSlMonthNoteChart(chart: unknown): boolean {
  return typeof chart === 'string' && MONTH_CHARTS.has(chart)
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct 14" for a day, "Oct" for a month: the graphs' own axis labels. */
export function slNoteLabel(key: string): string {
  const m = SHORT[Number(key.slice(5, 7)) - 1] ?? key
  return key.length === 7 ? m : `${m} ${Number(key.slice(8, 10))}`
}

/** An approved note drawn on a graph: its key (a day, or a month for a year to date graph), its number, its text. */
export type SlNoteMark = { at: string; n: number; label: string; text: string }
/** One noted day or month in the editor's list: its number when approved, its approved text, its draft and ids. */
export type SlNoteRow = { key: string; label: string; n: number | null; text: string | null; editor?: NoteEditorState }
/** What the Add annotation form and the buttons need. Editors only. */
export type SlNoteControls = { clientSlug: string; chart: SlNoteChart; canApprove: boolean; options: { key: string; label: string }[] }
/** One graph's notes: the marks (approved notes, numbered in order) and, for an editor, the list and the controls. With no
 *  approved note there is no mark, and the graph draws exactly as without notes. */
export type SlChartNotes = { marks: SlNoteMark[]; panel: SlNoteRow[]; controls?: SlNoteControls }

