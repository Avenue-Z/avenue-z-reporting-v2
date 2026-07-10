'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reportCommentary } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { isCommentaryViewKey } from '@/lib/commentary/views'
import { sanitizeCommentaryHtml } from '@/lib/commentary/sanitize'
import { validateCommentaryInput, planCommentaryWrite } from '@/lib/commentary/mutations'
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

/** Approve an entry for client visibility. Allowlist only. Other approved entries for
 *  the same view + period are left untouched — the client view shows only the most
 *  recently approved one per period (see visibleEntries), so a re-approval replaces
 *  the visible version and a revoke falls back to the previously approved one. */
export async function approveCommentary(id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

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
