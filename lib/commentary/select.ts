import type { CommentaryEntry, CommentaryCapabilities } from './types'

/** Avenue Z staff see every entry (full history). Clients see approved entries only,
 *  and at most one — the most recently approved — per reporting period. Deduping at
 *  read time (rather than demoting rows on approve) means a re-approval cleanly
 *  replaces the client-visible version, and a revoke *falls back* to the previously
 *  approved version for that period — with no row mutation or deletion. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  if (caps.canEdit) return entries
  return mostRecentApprovedPerPeriod(entries.filter((x) => x.status === 'approved'))
}

/** From approved entries, keep only the most-recently-approved one per
 *  (periodStart, periodEnd). Ties break on updatedAt. Preserves first-seen period
 *  order (newest-period-first when the input is period-descending). Non-mutating. */
export function mostRecentApprovedPerPeriod(approved: CommentaryEntry[]): CommentaryEntry[] {
  const best = new Map<string, CommentaryEntry>()
  const rank = (e: CommentaryEntry) => `${e.approvedAt ?? ''}|${e.updatedAt}`
  for (const e of approved) {
    const key = `${e.periodStart}|${e.periodEnd}`
    const cur = best.get(key)
    if (!cur || rank(e) > rank(cur)) best.set(key, e)
  }
  return [...best.values()]
}

/** The default entry to show: most recent by period start, then by last update.
 *  ISO date strings compare chronologically. Non-mutating. */
export function pickDefaultEntry(entries: CommentaryEntry[]): CommentaryEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort(
    (a, b) => b.periodStart.localeCompare(a.periodStart) || b.updatedAt.localeCompare(a.updatedAt),
  )[0]
}
