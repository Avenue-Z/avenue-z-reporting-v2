import { CHANNELS } from '../metrics'
import { isRealDay } from '../annotation-hides/mutations'
import { NOTE_MAX_CHARS, NOTE_MAX_POSTS } from './limits'

const CHARTS = new Set<string>(['followers', 'engagements'])
const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Today's date in UTC, the calendar Dash counts days on. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** A note id is a uuid. Checked before any query, so a malformed id is a plain refusal rather
 *  than a Postgres cast error thrown out of the action. */
export function isNoteId(id: unknown): id is string {
  return typeof id === 'string' && NOTE_ID.test(id)
}

/** What an approver was shown: the draft's text and picked posts, sent back with Approve. Shape
 *  only; the database match does the rest (approveNote). */
export function isSeenNote(seen: unknown): seen is { text: string; postIds: number[] } {
  if (!seen || typeof seen !== 'object') return false
  const { text, postIds } = seen as { text?: unknown; postIds?: unknown }
  return typeof text === 'string' && Array.isArray(postIds) && postIds.length <= NOTE_MAX_POSTS
    && postIds.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
}

/** Every C0 control, DEL, every C1 control (U+0080 to U+009F, such as NEL) and the line and
 *  paragraph separators U+2028 and U+2029, so a note stays one line of plain text (the last two
 *  groups added in Paul's review of #273, C10). A code point check rather than a regex, which
 *  eslint's no-control-regex would flag. */
function hasControl(text: string): boolean {
  return [...text].some((c) => {
    const n = c.codePointAt(0)!
    return n < 32 || (n >= 127 && n <= 159) || n === 0x2028 || n === 0x2029
  })
}

/** Pure validation for the save action's payload, the same way authorizeAnnotationHide is kept out
 *  of the action file (lib/organic-social/annotation-hides/mutations.ts:14-24). The first three
 *  checks are the ones that function makes today; the rest are new for notes. */
export function validateNoteInput(
  input: { channel: unknown; chart: unknown; day: unknown; body: unknown; postIds: unknown },
  today: string,
): { ok: boolean; error?: string } {
  if (typeof input.channel !== 'string' || !(CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: 'invalid channel' }
  if (typeof input.chart !== 'string' || !CHARTS.has(input.chart)) return { ok: false, error: 'invalid chart' }
  if (typeof input.day !== 'string' || !isRealDay(input.day)) return { ok: false, error: 'invalid day' }
  if (input.day > today) return { ok: false, error: 'That day has not happened yet.' }
  if (typeof input.body !== 'string') return { ok: false, error: 'invalid note' }
  const body = input.body.trim()
  const chars = [...body].length // characters, so an emoji counts once
  if (chars < 1 || chars > NOTE_MAX_CHARS) return { ok: false, error: `A note is 1 to ${NOTE_MAX_CHARS} characters.` }
  if (hasControl(body)) return { ok: false, error: 'A note is one line of plain text.' }
  const ids = input.postIds
  if (
    !Array.isArray(ids) || ids.length > NOTE_MAX_POSTS || new Set(ids).size !== ids.length
    || !ids.every((id) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)
  ) return { ok: false, error: `Pick at most ${NOTE_MAX_POSTS} posts.` }
  return { ok: true }
}
