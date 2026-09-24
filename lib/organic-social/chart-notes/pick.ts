import type { ChartNote } from '@/lib/db/schema'
import type { AnnotationChart, NoteEditorState } from '../annotations'

type Row = Pick<ChartNote, 'id' | 'chart' | 'day' | 'body' | 'postIds' | 'status' | 'approvedAt' | 'updatedAt' | 'deletedAt'>

/** One day's note as a viewer may see it. `editor` is present only for someone who can edit. */
export interface DayNote {
  approved: { id: string; text: string; postIds: number[] } | null
  editor?: NoteEditorState
}

const time = (d: Date | null) => (d ? d.getTime() : -Infinity)

/** The most recently approved row, ranked by approval time then last update: the rule
 *  mostRecentApprovedPerPeriod applies to Commentary (lib/commentary/select.ts:35-44). */
export function latestApproved<T extends Pick<Row, 'approvedAt' | 'updatedAt'>>(rows: T[]): T | null {
  let best: T | null = null
  for (const r of rows) {
    const later = !best
      || time(r.approvedAt) > time(best.approvedAt)
      || (time(r.approvedAt) === time(best.approvedAt) && r.updatedAt.getTime() > best.updatedAt.getTime())
    if (later) best = r
  }
  return best
}

/** Per day inside [from, to], on one chart: the approved note a client sees, and for an editor the
 *  ids and the open draft. A day with only a draft does not exist for someone who cannot edit. */
export function notesByDay(
  rows: Row[],
  o: { chart: AnnotationChart; from: string; to: string; canEdit: boolean },
): Map<string, DayNote> {
  const live = rows.filter((r) => !r.deletedAt && r.chart === o.chart && r.day >= o.from && r.day <= o.to)
  const out = new Map<string, DayNote>()
  for (const day of [...new Set(live.map((r) => r.day))].sort()) {
    const ofDay = live.filter((r) => r.day === day)
    const approved = latestApproved(ofDay.filter((r) => r.status === 'approved'))
    // chart_notes_one_open_draft allows one; newest first anyway, so the answer never depends on
    // row order if the index were ever missing.
    const draft = ofDay
      .filter((r) => r.status === 'draft')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null
    if (!approved && !(o.canEdit && draft)) continue
    out.set(day, {
      approved: approved ? { id: approved.id, text: approved.body, postIds: approved.postIds } : null,
      ...(o.canEdit
        ? {
            editor: {
              approvedId: approved?.id ?? null,
              approvedPostIds: approved?.postIds ?? [],
              draft: draft ? { id: draft.id, text: draft.body, postIds: draft.postIds } : null,
            },
          }
        : {}),
    })
  }
  return out
}
