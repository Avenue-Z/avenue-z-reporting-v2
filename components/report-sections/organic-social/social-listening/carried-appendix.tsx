// A keyword appendix carried from an earlier month (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md,
// Unit G): the same analysis box (SlAnalysis) with the carried entry as its only entry. A client and the PDF see its text;
// staff see where it came from and can write this month's own, which then goes through draft and approve as usual.
// monthlyCommentary (shared by every report) is not used here and stays unchanged. Server component.
import { toClientSafeEntry } from '@/lib/commentary/select'
import { monthOfEntry } from '@/lib/commentary/month'
import type { CommentaryLabels } from '@/lib/commentary/labels'
import type { CommentaryCapabilities, CommentaryEntry } from '@/lib/commentary/types'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { firstOf, lastOf, monthTitle } from '@/lib/organic-social/reporting-months'
import { SlAnalysis } from './analysis'

export function CarriedAppendix({ clientSlug, viewKey, entry, month, capabilities, labels }: {
  clientSlug: string; viewKey: CommentaryViewKey; entry: CommentaryEntry; month: string
  capabilities: CommentaryCapabilities; labels: CommentaryLabels
}) {
  const shown = capabilities.canEdit ? entry : toClientSafeEntry(entry)
  return (
    <SlAnalysis clientSlug={clientSlug} viewKey={viewKey} entries={[shown]} initialId={shown.id} clientEntryId={shown.id}
      capabilities={capabilities} history={[]} defaultPeriod={{ start: firstOf(month), end: lastOf(month) }} labels={labels}
      carriedFrom={monthTitle(monthOfEntry(entry))} />
  )
}
