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
