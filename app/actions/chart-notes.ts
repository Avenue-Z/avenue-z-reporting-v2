'use server'

import { revalidateTag } from 'next/cache'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { authorizeRowForClient, canDeleteDraft, guardNotDeleted } from '@/lib/commentary/mutations'
import { noteCapabilities } from '@/lib/organic-social/chart-notes/permissions'
import { isNoteId, isSeenNote, todayUtc, validateNoteInput } from '@/lib/organic-social/chart-notes/validate'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import {
  approveNote, findChartNote, findOpenDraft, insertDraft, isOpenDraftConflict,
  revokeNote, softDeleteDraft, updateDraft, type NoteKey,
} from '@/lib/organic-social/chart-notes/mutations'
import type { AnnotationChart } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'

type Result = { ok: true } | { ok: false; error: string }

const FORBIDDEN: Result = { ok: false, error: 'forbidden' }
const NOT_FOUND: Result = { ok: false, error: 'not found' }
// Notes are only for clients on locked months (the October set). Renaissance is not on locked
// months, so no action here can ever write a row for it, whoever calls the action.
const NOT_ON: Result = { ok: false, error: 'Notes are not on for this client.' }
// Approve or Revoke from a page opened before the note changed.
const CHANGED: Result = { ok: false, error: 'This note changed since you opened the page. Reload to see it.' }

/** Every action checks the role AND the email: the hide action checks only the role
 *  (app/actions/organic-social.ts:49), the Commentary actions only the email
 *  (app/actions/commentary.ts:58). A hidden control is not an authorization boundary. Not exported:
 *  a 'use server' module may only export async actions. */
async function viewer() {
  const session = await auth()
  const email = session?.user?.email ?? null
  return { email, ...noteCapabilities(session?.user?.role, email) }
}

/** Create a draft for the day, or edit the day's open draft. Always lands as a draft: editing an
 *  approved note leaves it visible to clients until the draft is approved. */
export async function saveChartNoteAction(input: {
  clientSlug: string; channel: string; chart: string; day: string; body: string; postIds: number[]
}): Promise<Result> {
  const v = await viewer()
  if (!v.canEdit) return FORBIDDEN
  if (typeof input.clientSlug !== 'string' || !input.clientSlug.trim()) return { ok: false, error: 'invalid client' }
  const valid = validateNoteInput(input, todayUtc())
  if (!valid.ok) return { ok: false, error: valid.error! }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!hasReportingMonths(client)) return NOT_ON

  const key: NoteKey = { clientId: client.id, channel: input.channel as DashChannel, chart: input.chart as AnnotationChart, day: input.day }
  const body = input.body.trim()
  try {
    const open = await findOpenDraft(key)
    // The open draft can be approved or deleted between this read and the write. The edit is then
    // saved as a new draft rather than lost behind a bare 'not found' (Paul's review of #273, C7); if
    // yet another draft opened meanwhile, the index refuses it and the message below says so.
    if (!open || !(await updateDraft(open.id, { body, postIds: input.postIds, by: v.email! }))) {
      await insertDraft({ ...key, body, postIds: input.postIds, by: v.email! })
    }
  } catch (e) {
    // Two people (or one double click) opening a draft on the same day: the index keeps one.
    if (isOpenDraftConflict(e)) return { ok: false, error: 'A draft is already open on this day. Reload to see it.' }
    throw e
  }
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Approve a note for client view. Approvers only; the row must belong to the named client and
 *  must not be deleted, and it must still hold exactly what the approver was shown (`seen`, see
 *  approveNote). An older approval of the same day stays in the table, superseded, so a revoke
 *  falls back to it, as Commentary does. */
export async function approveChartNoteAction(clientSlug: string, id: string, seen: { text: string; postIds: number[] }): Promise<Result> {
  const v = await viewer()
  if (!v.canApprove) return FORBIDDEN
  if (!isNoteId(id) || !isSeenNote(seen)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!hasReportingMonths(client)) return NOT_ON
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const alive = guardNotDeleted(row)
  if (!alive.ok) return { ok: false, error: alive.error! }
  if (!(await approveNote(id, v.email!, seen))) return CHANGED
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Return an approved note to draft. Refused while another draft is open on that day, so a day
 *  never holds two; the index catches the same case if one lands in between. Refused as changed when
 *  the row is no longer the approval clients see (revokeNote). */
export async function revokeChartNoteAction(clientSlug: string, id: string): Promise<Result> {
  const v = await viewer()
  if (!v.canApprove) return FORBIDDEN
  if (!isNoteId(id)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!hasReportingMonths(client)) return NOT_ON
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const busy = { ok: false as const, error: 'A draft is already open on this day. Delete or approve it first.' }
  const open = await findOpenDraft({ clientId: client.id, channel: row!.channel as DashChannel, chart: row!.chart as AnnotationChart, day: row!.day })
  if (open && open.id !== id) return busy
  try {
    if (!(await revokeNote(id))) return CHANGED
  } catch (e) {
    if (isOpenDraftConflict(e)) return busy
    throw e
  }
  revalidateTag('db', 'max')
  return { ok: true }
}

/** Soft delete a draft. Any editor, like Commentary; an approved note is refused, since a client
 *  may be reading it. The deleter is taken from the session, never from the caller. */
export async function deleteChartNoteDraftAction(clientSlug: string, id: string): Promise<Result> {
  const v = await viewer()
  if (!v.canEdit) return FORBIDDEN
  if (!isNoteId(id)) return NOT_FOUND
  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!hasReportingMonths(client)) return NOT_ON
  const row = await findChartNote(id)
  const mine = authorizeRowForClient(row, client.id)
  if (!mine.ok) return { ok: false, error: mine.error! }
  const deletable = canDeleteDraft(row)
  if (!deletable.ok) return { ok: false, error: deletable.error! }
  if (!(await softDeleteDraft(id, v.email!))) return NOT_FOUND
  revalidateTag('db', 'max')
  return { ok: true }
}
