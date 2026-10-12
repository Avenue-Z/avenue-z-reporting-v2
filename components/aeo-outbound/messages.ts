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
  // A database failure the action caught and logged (app/actions/aeo-outbound.ts): the same message as a throw.
  if (error === 'unavailable') return ACTION_FAILED
  return error
}

/** The editor could not load the report HTML (not a 404). Derived from §7a's "Lost connection", shown with a Reload button. */
export const VIEW_FAILED = 'Lost connection.'

/** A server action that threw or a request that dropped. Derived from §7a's "Lost connection" and "Try again" (Task 4.4 fix round 1). */
export const ACTION_FAILED = 'Lost connection. Try again.'
/** Leaving a draft with an edit not yet saved (Task 4.4 fix round 1, from the coordinator's review). */
export const LEAVE_UNSAVED = 'You have unsaved edits. Leave anyway?'

/** v1.1 §8: the no-access page names who to ask. */
export const askAdmin = (admins: string[]): string =>
  admins.length ? `Ask a New Business admin (${admins.join(', ')}) to add you.` : 'Ask a New Business admin to add you.'

/** v1.1 §11: Copy link. */
export const COPY_LINK = 'Copy link'
export const COPIED = 'Copied'
export const LINK_COPIED = 'Link copied'
export const COPY_FAILED = "Couldn't copy. Select the link and copy it."
export const LINK_FIELD = 'Link'
/** v1.1 §9: a 400 bad-request shows its own message. */
export const BAD_REQUEST = "That request wasn't valid. Refresh the page and try again."
/** v1.1 §6: the visible caveat next to every open count (best effort, round-2 MINOR 6). */
export const OPENS_CAVEAT = 'Email security scanners can open links automatically. Opens marked automated are likely scanners. The marking is best effort.'
