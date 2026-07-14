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
import { validateCommentaryInput, planCommentaryWrite, authorizeRowForClient, canDeleteDraft } from '@/lib/commentary/mutations'
import type { CommentaryInput, CommentaryStatus } from '@/lib/commentary/types'

type Result = { ok: true } | { ok: false; error: string }

/** Not exported: a `'use server'` module may only export async *actions*. */
async function findCommentaryRow(id: string) {
  const rows = await db
    .select({
      status: reportCommentary.status,
      clientId: reportCommentary.clientId,
      deletedAt: reportCommentary.deletedAt,
    })
    .from(reportCommentary)
    .where(eq(reportCommentary.id, id))
    .limit(1)
  return rows[0]
}

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

  // Determine the existing status. A named row must exist AND belong to this client;
  // otherwise reject outright rather than silently falling through to the INSERT branch
  // (which would turn a bad id into a surprise new entry).
  let existingStatus: CommentaryStatus | null = null
  if (input.id) {
    const row = await findCommentaryRow(input.id)
    const authorized = authorizeRowForClient(row, client.id)
    if (!authorized.ok) return { ok: false, error: authorized.error! }
    existingStatus = row!.status
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

/** Approve an entry for client visibility. Allowlist only, and scoped to clientSlug:
 *  the row must belong to that client (see authorizeRowForClient).
 *
 *  Other approved entries for the same view + period are left untouched in the DB —
 *  every view shows only the most recently approved one per period (see visibleEntries),
 *  so a re-approval replaces the previous version and a revoke falls back to it.
 *  Superseded rows are hidden, not deleted. */
export async function approveCommentary(clientSlug: string, id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const authorized = authorizeRowForClient(await findCommentaryRow(id), client.id)
  if (!authorized.ok) return { ok: false, error: authorized.error! }

  await db
    .update(reportCommentary)
    .set({ status: 'approved', approvedBy: email!, approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Revoke approval, returning an entry to draft (internal-only). Allowlist only, and
 *  scoped to clientSlug on the same basis as approveCommentary. */
export async function revokeCommentary(clientSlug: string, id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canApproveCommentary(email)) return { ok: false, error: 'forbidden' }

  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const authorized = authorizeRowForClient(await findCommentaryRow(id), client.id)
  if (!authorized.ok) return { ok: false, error: authorized.error! }

  await db
    .update(reportCommentary)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}

/** Soft-delete a draft. Any Avenue Z editor may delete any draft (product decision,
 *  2026-07-14): deleting is not a greater power than editing, since an editor can
 *  already gut a draft's contents by editing it.
 *
 *  The row is retained — `deleted_at` is set, nothing is removed — so the approver
 *  history log still shows it and it stays recallable at the DB level. Approved
 *  entries are refused (see canDeleteDraft): they may be what a client is reading.
 *
 *  deletedBy is the AUTHENTICATED actor, taken from the session — never a parameter.
 *  An audit log whose attribution can be asserted by the caller is worthless. */
export async function deleteCommentaryDraft(clientSlug: string, id: string): Promise<Result> {
  const session = await auth()
  const email = session?.user?.email
  if (!canEditCommentary(email)) return { ok: false, error: 'forbidden' }

  const client = await getClientBySlug(clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  const row = await findCommentaryRow(id)

  const authorized = authorizeRowForClient(row, client.id)
  if (!authorized.ok) return { ok: false, error: authorized.error! }

  const deletable = canDeleteDraft(row)
  if (!deletable.ok) return { ok: false, error: deletable.error! }

  await db
    .update(reportCommentary)
    .set({ deletedAt: new Date(), deletedBy: email!, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))

  revalidateTag('db', 'max')
  return { ok: true }
}
