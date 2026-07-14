import type { CommentaryEntry, CommentaryCapabilities } from './types'

/** Everyone sees at most one approved entry — the most recently approved — per
 *  reporting period, so a re-approval *replaces* the previous version rather than
 *  stacking beside it. Avenue Z staff additionally see drafts (including a pending
 *  edit that forked off an approved entry); clients see approved entries only.
 *
 *  Superseded rows are hidden, not deleted. Deduping at read time (rather than
 *  demoting or dropping rows on approve) is what lets a revoke *fall back* to the
 *  previously approved version for that period — with no row mutation or deletion. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  const approved = mostRecentApprovedPerPeriod(entries.filter((x) => x.status === 'approved'))
  if (!caps.canEdit) return approved

  // Preserve the caller's ordering (period desc, updatedAt desc) rather than the
  // grouped order, so the dropdown stays newest-period-first.
  const live = new Set(approved.map((x) => x.id))
  return entries.filter((x) => x.status === 'draft' || live.has(x.id))
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
