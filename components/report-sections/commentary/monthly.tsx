import { getCommentaryForView } from '@/lib/db/queries'
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { historyEntries, toClientSafeEntry, visibleEntries } from '@/lib/commentary/select'
import { clientOpensNote, eligibleEntries, pickMonthDefault } from '@/lib/commentary/month'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { firstOf, lastOf, monthTitle, viewerForRole } from '@/lib/organic-social/reporting-months'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'

type MonthlyClient = { id: string; slug: string; dashSocialConfig?: unknown }

/** Commentary for a locked-months client on an Organic Social view (spec 3.9, 4.7). A client-role
 *  viewer is a client whatever the email: approved entries of the served month only, ending by the
 *  newest month they can see, redacted, no history. Resolves the month with the same inputs and
 *  clock as the section, so both serve the same month. */
export async function monthlyCommentary({ client, role, email, viewKey, requestedRange }: {
  client: MonthlyClient; role: unknown; email: string | null; viewKey: CommentaryViewKey; requestedRange: string | undefined
}) {
  const viewer = viewerForRole(role)
  const capabilities = viewer === 'team'
    ? { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }
    : { canEdit: false, canApprove: false }
  const clock = requestClock()
  const locked = lockedRangeFor(client, role, requestedRange, clock)
  const month = locked?.month ?? null
  if (!month) {
    if (!capabilities.canEdit) return null
    return (
      <CommentaryPanel clientSlug={client.slug} viewKey={viewKey} entries={[]} initialId={null}
        capabilities={capabilities} history={[]} emptyText="No reporting months yet" />
    )
  }
  const all = await getCommentaryForView(client.id, viewKey)
  const visible = visibleEntries(all, capabilities)
  const cutoff = viewer === 'client' ? lastOf(locked!.months[0].key) : null
  const eligible = eligibleEntries(visible, month.key, cutoff)
  // Picked on the un-redacted entries: toClientSafeEntry blanks updatedAt (see select.ts).
  const initial = pickMonthDefault(eligible, month.key)
  if (!capabilities.canEdit && !initial) return null
  const entries = capabilities.canEdit ? eligible : eligible.map(toClientSafeEntry)
  const history = viewer === 'team' ? historyEntries(all, capabilities) : []
  const cfg = (client.dashSocialConfig as { reportingMonths?: unknown } | null | undefined)?.reportingMonths
  const entryNotes = viewer === 'team'
    ? Object.fromEntries(eligible.flatMap((e) => { const n = clientOpensNote(e, cfg, clock); return n ? [[e.id, n]] : [] }))
    : undefined
  return (
    <CommentaryPanel
      key={month.key}
      clientSlug={client.slug}
      viewKey={viewKey}
      entries={entries}
      initialId={initial?.id ?? null}
      capabilities={capabilities}
      history={history}
      defaultPeriod={{ start: firstOf(month.key), end: lastOf(month.key) }}
      emptyText={`No commentary for ${monthTitle(month.key)} yet`}
      entryNotes={entryNotes}
    />
  )
}
