import { and, eq, gt, isNull, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db/client'
import { chartNotes } from '@/lib/db/schema'
import type { AnnotationChart } from '../annotations'
import type { DashChannel } from '../metrics'

export type NoteKey = { clientId: string; channel: DashChannel; chart: AnnotationChart; day: string }

export const OPEN_DRAFT_INDEX = 'chart_notes_one_open_draft'

/** The fields every action checks before it writes. */
export async function findChartNote(id: string) {
  const rows = await db
    .select({
      clientId: chartNotes.clientId, status: chartNotes.status, deletedAt: chartNotes.deletedAt,
      channel: chartNotes.channel, chart: chartNotes.chart, day: chartNotes.day,
    })
    .from(chartNotes)
    .where(eq(chartNotes.id, id))
    .limit(1)
  return rows[0]
}

export async function findOpenDraft(k: NoteKey): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: chartNotes.id })
    .from(chartNotes)
    .where(and(
      eq(chartNotes.clientId, k.clientId), eq(chartNotes.channel, k.channel),
      eq(chartNotes.chart, k.chart), eq(chartNotes.day, k.day),
      eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt),
    ))
    .limit(1)
  return rows[0]
}

export async function insertDraft(k: NoteKey & { body: string; postIds: number[]; by: string }): Promise<void> {
  await db.insert(chartNotes).values({
    clientId: k.clientId, channel: k.channel, chart: k.chart, day: k.day,
    body: k.body, postIds: k.postIds, status: 'draft', createdBy: k.by, updatedBy: k.by,
  })
}

// Each write below re-asserts the state it expects and reports whether it hit a row, so a lost race
// reads as 'not found' rather than a false success. The same reasoning as Commentary's writes
// (app/actions/commentary.ts:17-34), including revoke's exemption from the deleted check.

export async function updateDraft(id: string, a: { body: string; postIds: number[]; by: string }): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ body: a.body, postIds: a.postIds, updatedBy: a.by, updatedAt: new Date() })
    .where(and(eq(chartNotes.id, id), eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt)))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

/** Approve exactly what the approver was shown. Editing a draft changes that same row, so without
 *  the text and posts in the match an edit made after the approver opened the page would be
 *  approved unread, and a client would see words nobody approved. Commentary approves by id
 *  alone (approveCommentary, app/actions/commentary.ts:122, its update at :136-140); this check is
 *  one of the two additions of our own, and lives only in the notes code. */
export function approveNoteQuery(id: string, by: string, seen: { text: string; postIds: number[] }) {
  return db
    .update(chartNotes)
    .set({ status: 'approved', approvedBy: by, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(
      // Only a draft: without this, a stale Approve on a note approved and since superseded re-stamped
      // its approval time and clients went back to the older text (Paul's review of #273, C2).
      eq(chartNotes.id, id), eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt),
      eq(chartNotes.body, seen.text), eq(chartNotes.postIds, seen.postIds),
    ))
    .returning({ id: chartNotes.id })
}

export async function approveNote(id: string, by: string, seen: { text: string; postIds: number[] }): Promise<boolean> {
  const rows = await approveNoteQuery(id, by, seen)
  return rows.length > 0
}

/** Return the approval clients see to draft, and only that one. It must be approved and live, and no
 *  live approved row of the same day may rank after it by latestApproved's rule (pick.ts:16-25):
 *  approved later, or at the same moment and updated later. Without this a Revoke from a page opened
 *  before a newer approval turned the superseded row into the day's open draft and reported success,
 *  while clients kept the newer note (Paul's second review of #273, R1). One statement, so no approval
 *  can land between the check and the write. */
export function revokeNoteQuery(id: string) {
  const newer = alias(chartNotes, 'newer')
  return db
    .update(chartNotes)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(and(
      eq(chartNotes.id, id), eq(chartNotes.status, 'approved'), isNull(chartNotes.deletedAt),
      notExists(db.select({ one: sql`1` }).from(newer).where(and(
        eq(newer.clientId, chartNotes.clientId), eq(newer.channel, chartNotes.channel),
        eq(newer.chart, chartNotes.chart), eq(newer.day, chartNotes.day),
        eq(newer.status, 'approved'), isNull(newer.deletedAt),
        or(
          gt(newer.approvedAt, chartNotes.approvedAt),
          and(eq(newer.approvedAt, chartNotes.approvedAt), gt(newer.updatedAt, chartNotes.updatedAt)),
        ),
      ))),
    ))
    .returning({ id: chartNotes.id })
}

export async function revokeNote(id: string): Promise<boolean> {
  const rows = await revokeNoteQuery(id)
  return rows.length > 0
}

/** Soft delete. The row stays, so who deleted it and when stay on record. */
export async function softDeleteDraft(id: string, by: string): Promise<boolean> {
  const rows = await db
    .update(chartNotes)
    .set({ deletedAt: new Date(), deletedBy: by, updatedAt: new Date() })
    .where(and(eq(chartNotes.id, id), eq(chartNotes.status, 'draft'), isNull(chartNotes.deletedAt)))
    .returning({ id: chartNotes.id })
  return rows.length > 0
}

/** True when a write lost the race for a day's one open draft: Postgres unique violation 23505 on
 *  chart_notes_one_open_draft. Drizzle wraps the driver's error (DrizzleQueryError.cause), so the
 *  chain is walked, at most 5 deep. Any other error is not ours to swallow. */
export function isOpenDraftConflict(e: unknown): boolean {
  let cur: unknown = e
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const { code, constraint, message, cause } = cur as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown }
    const named = constraint === OPEN_DRAFT_INDEX || (typeof message === 'string' && message.includes(OPEN_DRAFT_INDEX))
    if (code === '23505' && named) return true
    cur = cause
  }
  return false
}
