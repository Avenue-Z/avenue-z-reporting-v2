import type { CommentaryEntry, CommentaryCapabilities } from './types'

/** Avenue Z staff see every entry; clients see approved entries only. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  return caps.canEdit ? entries : entries.filter((x) => x.status === 'approved')
}

/** The default entry to show: most recent by period start, then by last update.
 *  ISO date strings compare chronologically. Non-mutating. */
export function pickDefaultEntry(entries: CommentaryEntry[]): CommentaryEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort(
    (a, b) => b.periodStart.localeCompare(a.periodStart) || b.updatedAt.localeCompare(a.updatedAt),
  )[0]
}
