// Paid Media Overview — the default landing subpage (item 5). Rolls up Paid
// Search, Meta, and LinkedIn into a combined top line plus a per-channel
// breakdown (items 1, 11a, 11b). It deliberately does NOT render a
// SharedPartsHeader: the Overview has no commentary box (item 6). The section is
// wrapped in ReportErrorBoundary at the page level, and getPaidMediaOverview
// uses Promise.allSettled, so one failed channel never crashes the page.

import { KpiCard } from '@/components/charts/kpi-card'
import { getPaidMediaOverview } from '@/lib/paid-media/overview'
import { getPaidMediaTrend } from '@/lib/paid-media/trend'
import { money } from '@/lib/paid-media/format'
import { num } from '@/lib/supermetrics/format'
import { PaidMediaTrendChart } from './trend'

const dash = '—'
const asMoney = (n: number | null) => (n == null ? dash : money(n))
const asNum = (n: number | null) => (n == null ? dash : num(n))

export async function PaidMediaOverviewReport({
  clientSlug,
  dateRange = 'last_30_days',
  compareRange = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}) {
  const [o, trend] = await Promise.all([
    getPaidMediaOverview(clientSlug, dateRange, compareRange),
    getPaidMediaTrend(clientSlug, dateRange),
  ])

  // Deltas (and the greyed "— vs prior period" placeholder) only appear when the
  // viewer selected a comparison period; with 'No Comparison' the tiles show values alone.
  const comparing = compareRange != null

  return (
    <div className="space-y-8">
      {/* Combined top line — Spend, Clicks, Leads, Cost per Lead (item 11a order). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title="Spend" value={asMoney(o.blendedSpend)} delta={o.blendedSpendDelta} comparisonExpected={comparing} />
        <KpiCard
          title="Clicks"
          value={asNum(o.blendedClicks)}
          delta={o.blendedClicksDelta}
          comparisonExpected={comparing}
          tooltip="Blended across Paid Search + LinkedIn (Meta is excluded from the blend)."
        />
        <KpiCard title="Leads" value={asNum(o.blendedLeads)} delta={o.blendedLeadsDelta} comparisonExpected={comparing} />
        <KpiCard title="Cost per Lead" value={asMoney(o.blendedCostPerLead)} delta={o.blendedCostPerLeadDelta} comparisonExpected={comparing} invertDelta />
      </div>

      <p className="text-xs text-text-muted">
        Blended figures cover Paid Search + LinkedIn only. Meta is shown per channel below but
        excluded from the blend (no lead data, and its reporting is handled separately), so the
        tiles reconcile: Cost per Lead equals blended Spend &divide; Leads. Blended figures are
        shown only when every one of those channels the client runs reports; a channel currently
        reporting 0 leads still contributes its spend to the blend.
      </p>

      <PaidMediaTrendChart trend={trend} />

      {/* Per-channel breakdown (item 11b). */}
      <div className="space-y-6">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">By Channel</p>
        {o.channels.map((c) => (
          <section key={c.key} className="space-y-3">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{c.label}</h3>
            <div className="grid grid-cols-3 gap-3">
              <KpiCard title="Spend" value={asMoney(c.spend)} delta={c.spendDelta} comparisonExpected={comparing} />
              <KpiCard title="Clicks" value={asNum(c.clicks)} delta={c.clicksDelta} comparisonExpected={comparing} />
              <KpiCard title="Leads" value={asNum(c.leads)} delta={c.leadsDelta} comparisonExpected={comparing} />
            </div>
          </section>
        ))}
        <p className="text-xs text-text-muted">
          Clicks are link clicks for Meta and all clicks for Paid Search and LinkedIn. Leads are shown
          per channel where available. Meta lead conversions are not available, so Meta shows &lsquo;—&rsquo;.
        </p>
      </div>
    </div>
  )
}
