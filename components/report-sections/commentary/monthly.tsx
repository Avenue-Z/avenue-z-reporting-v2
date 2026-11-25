import { getCommentaryForView } from '@/lib/db/queries'
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { historyEntries, toClientSafeEntry, visibleEntries } from '@/lib/commentary/select'
import { clientMonthEntry, clientOpensNote, eligibleEntries, pickMonthDefault } from '@/lib/commentary/month'
import { lockedRangeFor, requestClock } from '@/lib/organic-social/locked-range'
import { kitActive } from '@/lib/organic-social/design-from'
import { firstOf, lastOf, monthTitle, viewerForRole } from '@/lib/organic-social/reporting-months'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'
import { emptyMonthText, type CommentaryLabels } from '@/lib/commentary/labels'
import type { CommentaryEntry } from '@/lib/commentary/types'
import type { ComponentProps, ComponentType } from 'react'

type MonthlyClient = { id: string; slug: string; dashSocialConfig?: unknown }

/** A commentary box (Insights or Recommendations, per `labels`) for a locked-months client on an Organic Social
 *  view (spec 3.9, 4.7). A client-role viewer is a client whatever the email: approved entries of the served month
 *  only, ending by the newest month they can see, redacted, no history. Resolves the month with the same inputs and
 *  clock as the section, so both serve the same month. `entries`, when given, are rows already read for several boxes
 *  at once (the Social Listening tab's one prefix read, spec 2026-11-19 section 9): the box keeps the rows of its own
 *  view key and makes no query. Without it the box reads its own view, as every other caller does. */
export async function monthlyCommentary({ client, role, email, viewKey, requestedRange, labels, entries: prefetched, Panel = CommentaryPanel, look }: {
  client: MonthlyClient; role: unknown; email: string | null; viewKey: CommentaryViewKey; requestedRange: string | undefined
  labels: CommentaryLabels; entries?: CommentaryEntry[]
  /** The design kit's look, passed through to the Panel unchanged (CommentarySection decides when). Absent: no key. */
  look?: 'kit'
  /** The box that renders the entries. Default: CommentaryPanel, as every report uses. The Social Listening tab passes its
   *  own (the approved mockup's look) with the same props and the same commentary actions. */
  Panel?: ComponentType<ComponentProps<typeof CommentaryPanel>>
}) {
  const viewer = viewerForRole(role)
  const capabilities = viewer === 'team'
    ? { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }
    : { canEdit: false, canApprove: false }
  const clock = requestClock()
  const locked = lockedRangeFor(client, role, requestedRange, clock)
  const month = locked?.month ?? null
  // Option B: the kit look only on a served month on or after the client's designFrom; before it, the box is drawn as it
  // was delivered (commentary@1). Never adds a look the caller did not ask for (Social Listening passes none).
  const kitLook = look && kitActive(client, month?.key ?? null) ? { look } : {}
  if (!month) {
    if (!capabilities.canEdit) return null
    return (
      <Panel clientSlug={client.slug} viewKey={viewKey} entries={[]} initialId={null} clientEntryId={null}
        capabilities={capabilities} history={[]} emptyText="No reporting months yet" labels={labels} {...kitLook} />
    )
  }
  const all = prefetched ? prefetched.filter((e) => e.viewKey === viewKey) : await getCommentaryForView(client.id, viewKey)
  const visible = visibleEntries(all, capabilities)
  const cutoff = viewer === 'client' ? lastOf(locked!.months[0].key) : null
  const eligible = eligibleEntries(visible, month.key, cutoff)
  // Picked on the un-redacted entries: toClientSafeEntry blanks updatedAt (see select.ts).
  const initial = pickMonthDefault(eligible, month.key)
  // What a client opens on for this month, for the PDF export (it prints the client's view, whoever exports). For a
  // client viewer it is `initial`; for the team it is worked out from the client's own month list.
  const clientMonths = viewer === 'client' ? locked!.months : (lockedRangeFor(client, 'CLIENT_VIEWER', requestedRange, clock)?.months ?? [])
  const clientEntry = clientMonthEntry(all, month.key, clientMonths)
  if (!capabilities.canEdit && !initial) return null
  const entries = capabilities.canEdit ? eligible : eligible.map(toClientSafeEntry)
  const history = viewer === 'team' ? historyEntries(all, capabilities) : []
  const cfg = (client.dashSocialConfig as { reportingMonths?: unknown } | null | undefined)?.reportingMonths
  const entryNotes = viewer === 'team'
    ? Object.fromEntries(eligible.flatMap((e) => { const n = clientOpensNote(e, cfg, clock); return n ? [[e.id, n]] : [] }))
    : undefined
  return (
    <Panel
      key={month.key}
      clientSlug={client.slug}
      viewKey={viewKey}
      entries={entries}
      initialId={initial?.id ?? null}
      clientEntryId={clientEntry?.id ?? null}
      capabilities={capabilities}
      history={history}
      defaultPeriod={{ start: firstOf(month.key), end: lastOf(month.key) }}
      emptyText={emptyMonthText(labels, monthTitle(month.key))}
      entryNotes={entryNotes}
      labels={labels}
      {...kitLook}
    />
  )
}
