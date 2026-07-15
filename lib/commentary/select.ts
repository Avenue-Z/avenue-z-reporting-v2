import type {
  CommentaryEntry,
  CommentaryCapabilities,
  CommentaryVersionTag,
  CommentaryVersion,
  CommentaryPeriodHistory,
} from './types'

/** Everyone sees at most one approved entry — the most recently approved — per
 *  reporting period, so a re-approval *replaces* the previous version rather than
 *  stacking beside it. Avenue Z staff additionally see drafts (including a pending
 *  edit that forked off an approved entry); clients see approved entries only.
 *
 *  Soft-deleted rows are excluded outright, for every viewer. This is the ONLY thing
 *  standing between a deleted draft and a client's screen — every read path funnels
 *  through here (the approver log goes through historyEntries below).
 *
 *  Superseded rows are hidden, not deleted. Deduping at read time (rather than
 *  demoting or dropping rows on approve) is what lets a revoke *fall back* to the
 *  previously approved version for that period — with no row mutation or deletion. */
export function visibleEntries(entries: CommentaryEntry[], caps: CommentaryCapabilities): CommentaryEntry[] {
  const alive = entries.filter((x) => !x.deletedAt)
  const approved = mostRecentApprovedPerPeriod(alive.filter((x) => x.status === 'approved'))
  if (!caps.canEdit) return approved

  // Preserve the caller's ordering (period desc, updatedAt desc) rather than the
  // grouped order, so the dropdown stays newest-period-first.
  const live = new Set(approved.map((x) => x.id))
  return alive.filter((x) => x.status === 'draft' || live.has(x.id))
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

/** Strip the attribution a client must never receive: who edited/approved (internal
 *  staff emails) and when (the modified/approved timestamps #148 asked to hide). The
 *  panel only renders these behind `capabilities.canEdit`, but a JSX gate does NOT
 *  stop them crossing the RSC→client boundary — every field on an entry serializes
 *  into the browser bundle regardless of what renders. Same reasoning as the
 *  historyEntries gate: redact server-side so a non-editor's props carry nothing to
 *  leak. Deleted rows are already filtered out for non-editors upstream, so
 *  deletedAt/deletedBy are null here regardless. */
export function toClientSafeEntry(entry: CommentaryEntry): CommentaryEntry {
  return { ...entry, updatedBy: '', updatedAt: '', approvedBy: null, approvedAt: null }
}

/** The default entry to show: most recent by period start, then by last update.
 *  ISO date strings compare chronologically. Non-mutating. */
export function pickDefaultEntry(entries: CommentaryEntry[]): CommentaryEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort(
    (a, b) => b.periodStart.localeCompare(a.periodStart) || b.updatedAt.localeCompare(a.updatedAt),
  )[0]
}

/** Label one version relative to what the client currently sees.
 *
 *  PRECEDENCE IS PART OF THE CONTRACT: `deleted` is checked FIRST, before the
 *  live-winner test. A deleted row can't reach liveIds today (it keeps status
 *  'draft', and the DB CHECK forbids approved+deleted), so this is defense-in-depth
 *  — it keeps the function correct regardless of how the caller builds liveIds. */
export function tagVersion(entry: CommentaryEntry, liveIds: Set<string>): CommentaryVersionTag {
  if (entry.deletedAt) return 'deleted'
  if (liveIds.has(entry.id)) return 'live'
  if (entry.status === 'approved') return 'superseded'
  return 'draft'
}

/** The full version stack — superseded, drafts, and deleted rows — grouped by
 *  reporting period. APPROVERS ONLY: returns [] for anyone else.
 *
 *  This gate is enforced server-side by the RSC that calls it. It must never be
 *  weakened to a UI-only check: these entries carry body text that a client (and a
 *  non-approver editor) must not receive across the RSC→client boundary. */
export function historyEntries(
  entries: CommentaryEntry[],
  caps: CommentaryCapabilities,
): CommentaryPeriodHistory[] {
  if (!caps.canApprove) return []

  const liveIds = new Set(
    mostRecentApprovedPerPeriod(
      entries.filter((x) => x.status === 'approved' && !x.deletedAt),
    ).map((x) => x.id),
  )

  const groups = new Map<string, CommentaryPeriodHistory>()
  for (const entry of entries) {
    const key = `${entry.periodStart}|${entry.periodEnd}`
    let group = groups.get(key)
    if (!group) {
      group = { periodStart: entry.periodStart, periodEnd: entry.periodEnd, versions: [] }
      groups.set(key, group)
    }
    const version: CommentaryVersion = { entry, tag: tagVersion(entry, liveIds) }
    group.versions.push(version)
  }
  return [...groups.values()]
}
