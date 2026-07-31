// Paid Media Overview — the default landing subpage (item 5). Rolls up Paid
// Search, Meta, and LinkedIn into a combined top line plus a per-channel
// breakdown (items 1, 11b). It deliberately does NOT render a SharedPartsHeader:
// the Overview has no commentary box (item 6).
//
// Task 1 ships this as an empty shell; the rollup lib (Task 6) and the combined
// + per-channel tiles (Task 7) fill it. Blended Leads / Cost-per-lead stay
// unavailable until the "HubSpot lead" definition is settled (spec Blocker 1).

export async function PaidMediaOverviewReport({
  clientSlug,
  dateRange = 'last_30_days',
}: {
  clientSlug: string
  dateRange?: string
}) {
  // Referenced so the shell keeps the RSC prop contract the dispatch passes;
  // Tasks 6-7 consume both for the rollup.
  void clientSlug
  void dateRange

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
        Overview is coming together. It will roll up Spend, Clicks, Leads, and
        Cost per lead across Paid Search, Meta, and LinkedIn.
      </div>
    </div>
  )
}
