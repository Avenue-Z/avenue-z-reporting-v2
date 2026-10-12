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
/** §9a: 403, 404 or 409 on a save, and a stale approve. */
export const STALE = 'This snapshot changed. Reload.'
export const GONE = 'This snapshot no longer exists.'
export const FLUSH_WAIT = 'Saving. Try again in a moment.'

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
/** v1.1 §2: the Edit button, its states, the banner and the locked messages. */
export const EDIT = 'Edit'
export const DONE_EDITING = 'Done editing'
export const EDIT_COPY = 'Edit a copy'
export const EDIT_COPY_HINT = 'This report is frozen. Editing makes a new draft.'
export const EDIT_BANNER = 'Editing. Click any outlined text to change it. Changes save automatically. Charts come from Peec: to change them, change the dates and Rerun.'
export const LOCKED_CHART = 'Charts come from Peec data. Change the dates and Rerun to update them.'
export const LOCKED_FIXED = 'This part is set automatically.'
export const LOCKED_MIRROR = 'Edit this where it first appears on the page.'
/** v1.1 §4: the Before you send panel. */
export const BEFORE_YOU_SEND = 'Before you send'
export const FILL_THESE = 'Fill these in'
export const CHECK_THESE = 'Check these'
export const OWN_CHECKS_TITLE = 'Your own checks'
export const ABOUT_DATA = 'About this data'
export const LOOKS_RIGHT = 'Looks right'
export const NOTHING_TO_FILL = 'Nothing to fill in.'
export const NOTHING_TO_CHECK = 'Nothing to check.'
export const fillFirst = (n: number): string => (n === 1 ? 'Fill in 1 item first' : `Fill in ${n} items first`)
/** v1.1 §11: dialogs with verb buttons that name the brand, the recipient and the consequence. */
export const APPROVE_AND_CREATE = 'Approve and create link'
export const CANCEL = 'Cancel'
export const revokeTitle = (brand: string, recipient: string | null): string =>
  `Revoke the link for ${brand}${recipient ? ` sent to ${recipient}` : ''}? It stops working right away and can't be turned back on.`
export const REVOKE_LINK = 'Revoke link'
export const KEEP_LINK = 'Keep link'
export const discardTitle = (brand: string): string => `Discard the snapshot for ${brand}? It is removed from the hub.`
export const DISCARD_SNAPSHOT = 'Discard snapshot'
export const KEEP_SNAPSHOT = 'Keep snapshot'
export const rerunTitle = (brand: string): string => `Rerun ${brand}? This makes a new draft with fresh Peec data and new copy. This draft stays as it is.`
export const MAKE_NEW_DRAFT = 'Make a new draft'
export const KEEP_DRAFT = 'Keep this draft'
export const LEAVE = 'Leave'
export const STAY = 'Stay'
/** v1.1 §9 and §10. */
export const LOADING_REPORT = 'Loading report…'
export const UNREADABLE = "This snapshot was saved by an older version and can't be shown. Rerun it."
/** v1.1 §6: the open list. */
export const OPENS_TITLE = 'Opens'
export const NO_OPENS = 'No opens yet.'
export const PERSON = 'Person'
export const AUTOMATED = 'Automated'
export const notClassified = (n: number): string => `${n} not classified`
/** v1.1 §5: the hub. */
export const HUB_SUBTITLE = 'One-page AI visibility snapshots for prospects. Generate, edit, approve, send and track.'
export const SETTINGS = 'Settings'
export const SEARCH_LABEL = 'Search'
export const SEARCH_PLACEHOLDER = 'Brand, project, recipient or creator'
export const EMPTY_FIRST = 'No snapshots yet. Pick a Peec project above and click Generate.'
export const EMPTY_MATCH = 'No snapshots match.'
export const CLEAR_FILTERS = 'Clear filters'
export const SHOW_OLDER = 'Show older'
export const OLDER_FAILED = "Couldn't load older snapshots. Try again."
export const PREVIOUS = 'Previous'
export const NEXT = 'Next'
export const pageOf = (page: number, pages: number): string => `Page ${page} of ${pages}`
export const createdByLine = (email: string): string => `by ${email}`
export const draftReady = (brand: string): string => `Draft ready: ${brand}.`
export const OPEN = 'Open'
export const firstOpened = (when: string): string => `First opened ${when}`
export const lastOpened = (when: string): string => `Last opened ${when}`
export const NO_OPENS_SHORT = 'No opens yet'
/** v1.1 §11: the project picker. */
export const PROJECT_LABEL = 'Peec project'
export const PICK_PROJECT = 'Pick a Peec project'
export const LOADING_PROJECTS = 'Loading Peec projects…'
export const NO_PROJECT_MATCH = 'No Peec project matches.'

/** v1.1 §8: the Settings page. */
export const SETTINGS_TITLE = 'Settings'
export const SETTINGS_NOTE = 'Changes apply to snapshots generated from now on. Existing drafts and sent links keep their words.'
export const SETTINGS_INVALID = "The saved settings couldn't be read, so the defaults are shown. Saving replaces them."
export const NOT_ADMIN = 'Only New Business admins can change these settings.'
export const adminsLine = (admins: string[]): string => (admins.length ? `Admins: ${admins.join(', ')}.` : '')
export const USERS_HELP = 'One @avenuez.com email per line. People in AEO_OUTBOUND_USERS can always use the tool.'
export const ADMINS_HELP = 'Admins can change these settings. People in AEO_OUTBOUND_USERS are always admins.'
export const alwaysAdmins = (emails: string[]): string => (emails.length ? `Always admins: ${emails.join(', ')}.` : '')
export const FIRST_SECTION = 'First section title'
export const SECOND_SECTION = 'Second section title'
export const NEXT_WRITTEN = 'Written for each report'
export const NEXT_FIXED = 'The same sentence on every report'
export const NEXT_SENTENCE = 'Next-step sentence'
export const RANK_ALL = 'Every brand tracked in Peec'
export const RANK_TOP = 'The brand and its top competitors'
export const RANK_COUNT = 'Brands in all'
export const SAVE_SETTINGS = 'Save settings'
export const SAVING = 'Saving…'
export const SAVED = 'Saved'
export const RECENT_CHANGES = 'Recent changes'
export const NO_CHANGES = 'No changes yet.'
export const changeLine = (when: string, who: string, field: string): string => `${when}: ${who} changed ${field}`
