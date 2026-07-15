import type { CommentaryStatus } from './types'

/** Validate a (already-sanitized) commentary payload. Body must have visible text;
 *  both dates required; start ≤ end (lexical compare works for 'YYYY-MM-DD'). */
export function validateCommentaryInput(input: {
  bodyHtml: string
  periodStart: string
  periodEnd: string
}): { ok: boolean; error?: string } {
  const text = (input.bodyHtml ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  if (!text) return { ok: false, error: 'Commentary body is required.' }
  if (!input.periodStart || !input.periodEnd) return { ok: false, error: 'A date range is required.' }
  if (input.periodStart > input.periodEnd) return { ok: false, error: 'Start date must be on or before the end date.' }
  return { ok: true }
}

/** Decide UPDATE vs INSERT. Editing an approved entry forks a new draft so the
 *  client-visible approved row is never disturbed; editing a draft updates it. */
export function planCommentaryWrite(existingStatus: CommentaryStatus | null): { op: 'insert' | 'update' } {
  return existingStatus === 'draft' ? { op: 'update' } : { op: 'insert' }
}

/** A commentary row may only be acted on by a request scoped to its own client.
 *  Every action that takes a row id must run this before writing: without it, a
 *  stale or mismatched id silently mutates another client's row.
 *
 *  Missing and foreign rows return the SAME error — a caller must not be able to
 *  probe which ids exist by diffing the responses. */
export function authorizeRowForClient(
  row: { clientId: string } | undefined,
  clientId: string,
): { ok: boolean; error?: string } {
  if (!row || row.clientId !== clientId) return { ok: false, error: 'not found' }
  return { ok: true }
}

/** A soft-deleted row may not be mutated further (approved or saved over) — the same
 *  'not found' as authorizeRowForClient, so a caller can't probe which ids exist by
 *  diffing "forbidden/deleted" from "missing". Used by saveCommentary and
 *  approveCommentary; deleteCommentaryDraft uses the stricter canDeleteDraft instead,
 *  and revokeCommentary intentionally has no guard (draft → draft on a deleted row is
 *  a harmless no-op). */
export function guardNotDeleted(
  row: { deletedAt: Date | string | null } | undefined,
): { ok: boolean; error?: string } {
  if (!row || row.deletedAt) return { ok: false, error: 'not found' }
  return { ok: true }
}

/** Only a live draft may be soft-deleted.
 *
 *  Approved entries are refused because they may be what a client is currently
 *  reading — deletion must never pull content out from under them. An already-deleted
 *  row is refused with the SAME 'not found' as a missing row, so a double-delete is an
 *  explicit failure rather than a silent success the UI would report as "deleted". */
export function canDeleteDraft(
  row: { status: CommentaryStatus; deletedAt: Date | string | null } | undefined,
): { ok: boolean; error?: string } {
  if (!row || row.deletedAt) return { ok: false, error: 'not found' }
  if (row.status !== 'draft') return { ok: false, error: 'Only drafts can be deleted.' }
  return { ok: true }
}
