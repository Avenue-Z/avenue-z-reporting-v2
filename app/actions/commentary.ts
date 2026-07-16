'use server'

import { revalidateTag } from 'next/cache'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { reportCommentary } from '@/lib/db/schema'
import { getClientBySlug } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditCommentary, canApproveCommentary } from '@/lib/commentary/permissions'
import { isCommentaryViewKey } from '@/lib/commentary/views'
import { sanitizeCommentaryHtml } from '@/lib/commentary/sanitize'
import { validateCommentaryInput, planCommentaryWrite, authorizeRowForClient, guardNotDeleted, canDeleteDraft } from '@/lib/commentary/mutations'
import type { CommentaryInput, CommentaryStatus } from '@/lib/commentary/types'

type Result = { ok: true } | { ok: false; error: string }

/** The three sensitive writes below (saveCommentary, approveCommentary, deleteCommentaryDraft)
 *  re-assert `deleted_at IS NULL` in their WHERE clause, even though the caller has already run
 *  guardNotDeleted / canDeleteDraft against a freshly-read row. (revokeCommentary is exempt: it
 *  writes status='draft', which no deleted row can violate, so a lost race there is a harmless
 *  no-op — see its body.)
 *
 *  The guards read, then write: a delete landing in between would slip through. That is not
 *  theoretical — approving a row deleted in that window violates the
 *  report_commentary_no_deleted_approved CHECK constraint, and the driver throws out of the
 *  action rather than returning a Result. Matching on the deleted state at write time closes
 *  the window: the UPDATE simply matches nothing.
 *
 *  Which is exactly why these writes must also check whether they hit anything. An UPDATE
 *  that matches zero rows succeeds — so without this, losing the race would return { ok: true }
 *  for a write that did nothing, and the UI would report success. `.returning()` turns that
 *  silent no-op into the same explicit 'not found' every other rejection uses.
 *
 *  Not exported: a `'use server'` module may only export async *actions*. */
function affectedNothing(rows: { id: string }[]): boolean {
  return rows.length === 0
}

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
    const notDeleted = guardNotDeleted(row)
    if (!notDeleted.ok) return { ok: false, error: notDeleted.error! }
    existingStatus = row!.status
  }

  const plan = planCommentaryWrite(existingStatus)
  if (plan.op === 'update' && input.id) {
    const updated = await db
      .update(reportCommentary)
      .set({
        bodyHtml,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        updatedBy: email!,
        updatedAt: new Date(),
      })
      .where(and(eq(reportCommentary.id, input.id), isNull(reportCommentary.deletedAt)))
      .returning({ id: reportCommentary.id })

    // Deleted out from under us mid-edit. Failing loudly beats writing the user's
    // work into a row nothing will ever render again.
    if (affectedNothing(updated)) return { ok: false, error: 'not found' }
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

  const row = await findCommentaryRow(id)
  const authorized = authorizeRowForClient(row, client.id)
  if (!authorized.ok) return { ok: false, error: authorized.error! }
  const notDeleted = guardNotDeleted(row)
  if (!notDeleted.ok) return { ok: false, error: notDeleted.error! }

  const approved = await db
    .update(reportCommentary)
    .set({ status: 'approved', approvedBy: email!, approvedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(reportCommentary.id, id), isNull(reportCommentary.deletedAt)))
    .returning({ id: reportCommentary.id })

  // Deleted between the guard and this write. Without the isNull match this UPDATE would
  // violate the deleted⇒draft CHECK constraint and throw out of the action.
  if (affectedNothing(approved)) return { ok: false, error: 'not found' }

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

  // No isNull(deletedAt) guard here (unlike the other writes): revoke only ever sets
  // status='draft', which no deleted row can violate, so racing a delete is harmless.
  // The .returning() check is only for uniform 'not found' semantics across the actions.
  const revoked = await db
    .update(reportCommentary)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(eq(reportCommentary.id, id))
    .returning({ id: reportCommentary.id })

  if (affectedNothing(revoked)) return { ok: false, error: 'not found' }

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

  const deleted = await db
    .update(reportCommentary)
    .set({ deletedAt: new Date(), deletedBy: email!, updatedAt: new Date() })
    .where(and(eq(reportCommentary.id, id), isNull(reportCommentary.deletedAt)))
    .returning({ id: reportCommentary.id })

  // Two editors deleting at once: only the first wins. Without the isNull match the
  // second would overwrite deleted_by, and the audit log would name the wrong person.
  if (affectedNothing(deleted)) return { ok: false, error: 'not found' }

  revalidateTag('db', 'max')
  return { ok: true }
}
