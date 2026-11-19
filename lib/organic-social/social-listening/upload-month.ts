// lib/organic-social/social-listening/upload-month.ts
// The month an upload belongs to, worked out on the server (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// sections 5 and 7). Never taken from the form: the request's range is resolved exactly as the page resolves it for the
// team, so the upload lands on the month the staff member is looking at. A file for any other month is then refused by
// the parser's V4 (the file's own date range must be that month). Pure: the clock is an argument.
import { lockedRangeFor } from '../locked-range'
import { lastOf, monthTitle, type Clock } from '../reporting-months'

// The team's view of the months (the live month and every finished one back to firstMonth). Only staff upload.
const TEAM_ROLE = 'INTERNAL_ADMIN'

export type UploadMonth = { ok: true; month: string; beforeOpen: boolean } | { ok: false; error: string }

/** The served month for `requestedRange`, when it has finished. `beforeOpen` is whether the upload is made before the
 *  month opens to the client: before 00:00 New York on its open day (R2-15), the day `opensOn` gives with the client's
 *  settings at this moment. `clock.today` is the New York date (clockFor), so comparing the two dates is that
 *  midnight. Stored once on the upload row, so a later settings change never moves the presented upload (D5). */
export function uploadMonth(client: unknown, requestedRange: string | undefined, clock: Clock): UploadMonth {
  const month = lockedRangeFor(client, TEAM_ROLE, requestedRange, clock)?.month ?? null
  if (!month) return { ok: false, error: 'No reporting months yet.' }
  // Finished: not the live month, and its last day is no later than the last complete UTC day (section 5).
  if (month.live || lastOf(month.key) > clock.lastCompleteUtcDay) {
    return { ok: false, error: `Upload opens when ${monthTitle(month.key)} ends.` }
  }
  return { ok: true, month: month.key, beforeOpen: clock.today < month.opensOn }
}
