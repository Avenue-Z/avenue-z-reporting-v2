// Every message the hub and editor show, each from the spec (cited) or the task brief.
/** §8: pages and the 403 answer. */
export const ACCESS_MESSAGE = 'This tool is limited to the New Business team.'
/** §7a: a dropped connection or an unexpected 5xx. */
export const LOST_CONNECTION = 'Lost connection. Refreshing'
/** §7a: 400 with code bad-project (and any other 400 that is not bad-range). */
export const BAD_PROJECT = "This Peec project can't be used."
/** The generate route's 404 bad-rerun answer. */
export const BAD_RERUN = "That snapshot can't be rerun. Refresh the list."
/** §10: the projects dropdown failed to load. */
export const PEEC_DOWN_RETRY = 'Peec is unavailable. Retry'
/** §2 step 5. */
export const APPROVE_CONFIRM = "Approving freezes this report. You can't edit it after this. To change it, use Edit a copy."
/** §2 step 5 and §10: the required field in the Approve dialog. */
export const RECIPIENT_LABEL = 'Who is this for?'
export const RECIPIENT_EXAMPLE = 'Jane Doe, Acme'
/** §2 step 8. */
export const REVOKE_CONFIRM = 'Revoke this link? The link stops working immediately and permanently.'
/** §2 step 11. */
export const DISCARD_CONFIRM = 'Discard this snapshot? This removes it from the hub.'
/** §9a: 403, 404 or 409 on a save, and a stale approve. */
export const STALE = 'This snapshot changed. Reload.'
export const GONE = 'This snapshot no longer exists.'
export const FLUSH_WAIT = 'Saving. Try again in a moment.'
export const GENERATING_EDITOR = 'Generating. This takes about a minute.'
/** §2 step 7 and §10: the Opens hover line. */
export const SCANNER_NOTE = 'Email security scanners can count as an open'
/** The approve action's Needs-validation refusal (app/actions/aeo-outbound.ts), reused as Approve's tooltip. */
export const NEEDS_VALIDATION_FIRST = 'Fill in every "Needs validation" first.'

/** What an action's { ok: false, error } means to Ryan. Unknown errors (RECIPIENT_ERROR, Needs validation) show as sent. */
export function actionError(error: string): string {
  if (error === 'forbidden') return ACCESS_MESSAGE
  if (error === 'not found') return GONE
  if (error === 'stale') return STALE
  return error
}

/** The editor could not load the report HTML (not a 404). Derived from §7a's "Lost connection", shown with a Reload button. */
export const VIEW_FAILED = 'Lost connection.'
