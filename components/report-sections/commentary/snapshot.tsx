import type { ReactElement } from 'react'
import { getCommentaryForView } from '@/lib/db/queries'
import { canApproveCommentary, canEditCommentary } from '@/lib/commentary/permissions'
import { historyEntries, pickDefaultEntry, toClientSafeEntry, visibleEntries } from '@/lib/commentary/select'
import { INSIGHTS_LABELS, type CommentaryLabels } from '@/lib/commentary/labels'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { CommentaryPanel } from './commentary-panel'

/** The snapshot date of a `YYYY-MM-DD,YYYY-MM-DD` range whose two dates are equal; null for anything else. */
export function snapshotDateOf(requestedRange: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/.exec(requestedRange ?? '')
  return m && m[1] === m[2] ? m[1] : null
}

/** 'YYYY-MM-DD' to 'Snapshot: Nov 1, 2026' without timezone drift. */
function snapshotLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return `Snapshot: ${new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

/** A commentary box bound to one monthly snapshot (Technical Audit): its entries are those whose period is exactly
 *  `snapshotDate` to `snapshotDate`. Same rules as CommentarySection: staff always get the panel, a client only with an
 *  approved entry, and staff emails/timestamps and history never cross to a non-staff or non-approver viewer. */
export async function snapshotCommentary({ client, email, viewKey, snapshotDate, labels = INSIGHTS_LABELS }: {
  client: { id: string; slug: string }; email: string | null; viewKey: CommentaryViewKey; snapshotDate: string
  labels?: CommentaryLabels
}): Promise<ReactElement | null> {
  const capabilities = { canEdit: canEditCommentary(email), canApprove: canApproveCommentary(email) }
  const all = (await getCommentaryForView(client.id, viewKey)).filter((e) => e.periodStart === snapshotDate && e.periodEnd === snapshotDate)
  const visible = visibleEntries(all, capabilities)
  // Picked on the un-redacted entries: toClientSafeEntry blanks updatedAt (see select.ts).
  const initial = pickDefaultEntry(visible)
  if (!capabilities.canEdit && !initial) return null
  const clientEntry = capabilities.canEdit ? pickDefaultEntry(visibleEntries(all, { canEdit: false, canApprove: false })) : initial
  // Server-side redaction: props cross the RSC boundary whatever the panel renders.
  const entries = capabilities.canEdit ? visible : visible.map(toClientSafeEntry)
  const history = historyEntries(all, capabilities)
  return (
    <CommentaryPanel
      key={snapshotDate}
      clientSlug={client.slug}
      viewKey={viewKey}
      entries={entries}
      initialId={initial?.id ?? null}
      clientEntryId={clientEntry?.id ?? null}
      capabilities={capabilities}
      history={history}
      defaultPeriod={{ start: snapshotDate, end: snapshotDate }}
      periodLabel={snapshotLabel(snapshotDate)}
      emptyText="No commentary for this snapshot yet"
      labels={labels}
    />
  )
}
