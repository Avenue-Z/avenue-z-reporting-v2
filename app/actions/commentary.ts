'use server'

import { revalidateTag } from 'next/cache'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reportCommentary } from '@/lib/db/schema'
import { getClientBySlug, getCommentaryForView } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { isCommentaryViewKey } from '@/lib/commentary/views'
import { sanitizeCommentaryHtml } from '@/lib/commentary/sanitize'
import { validateCommentaryInput, planCommentaryWrite, approvedSiblingsToDemote } from '@/lib/commentary/mutations'
import type { CommentaryInput, CommentaryStatus } from '@/lib/commentary/types'

type Result = { ok: true } | { ok: false; error: string }

/** Create or edit a commentary entry. Editing an approved entry forks a new draft
 *  (see planCommentaryWrite); editing a draft updates in place. Always lands as/stays draft. */
export async function saveCommentary(input: CommentaryInput): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canEditCommentary(email)) return { ok: false, error: 'forbidden' }
  if (!isCommentaryViewKey(input.viewKey)) return { ok: false, error: 'invalid viewKey' }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const bodyHtml = sanitizeCommentaryHtml(input.bodyHtml)
  const valid = validateCommentaryInput({ bodyHtml, periodStart: input.periodStart, periodEnd: input.periodEnd })
  if (!valid.ok) return { ok: false, error: valid.error! }

  // Determine the existing status (only for a row that belongs to this client).
  let existingStatus: CommentaryStatus | null = null
  if (input.id) {
    const rows = await db
      .select({ status: reportCommentary.status, clientId: reportCommentary.clientId })
      .from(reportCommentary)
      .where(eq(reportCommentary.id, input.id))
      .limit(1)
    const row = rows[0]
    if (row && row.clientId === client.id) existingStatus = row.status
  }

  const plan = planCommentaryWrite(existingStatus)
  if (plan.op === 'update' && input.id) {
    await db
      .update(reportCommentary)
      .set({
        bodyHtml,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        updatedBy: email!,
        updatedAt: new Date(),
      })
      .where(eq(reportCommentary.id, input.id))
  } else {
    await db.insert(reportCommentary).values({
      clientId: client.id,
      viewKey: input.viewKey,
      bodyHtml,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'draft',
      createdBy: email!,
      updatedBy: email!,
    })
  }

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Approve an entry for client visibility. Allowlist only. Retires any other
 *  approved entry for the same (client, view, reporting period) so a client sees
 *  exactly one approved version per period — different-period approvals are kept. */
export async function approveCommentary(id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  const rows = await db
    .select({
      clientId: reportCommentary.clientId,
      viewKey: reportCommentary.viewKey,
      periodStart: reportCommentary.periodStart,
      periodEnd: reportCommentary.periodEnd,
    })
    .from(reportCommentary)
    .where(eq(reportCommentary.id, id))
    .limit(1)
  const target = rows[0]
  if (!target) return { ok: false, error: 'not found' }

  // Demote any other approved row for the same view + period back to draft.
  const all = await getCommentaryForView(target.clientId, target.viewKey)
  const demoteIds = approvedSiblingsToDemote({ id, periodStart: target.periodStart, periodEnd: target.periodEnd }, all)
  if (demoteIds.length > 0) {
    await db
      .update(reportCommentary)
      .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
      .where(inArray(reportCommentary.id, demoteIds))
  }

  await db
    .update(reportCommentary)
    .set({ status: 'approved', approvedBy: email!, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Revoke approval, returning an entry to draft (internal-only). Allowlist only. */
export async function revokeCommentary(id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  await db
    .update(reportCommentary)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}
