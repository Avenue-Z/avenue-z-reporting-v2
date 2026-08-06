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

  return (
    <div className="space-y-8">
      {/* Combined top line — Spend + Clicks (item 11a). Blended Leads / Cost per Lead were
          scrapped: Meta has no lead data and LinkedIn reports 0 leads today, so a blended lead
          figure would mislead. Per-channel Leads stay in the breakdown below. */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard title="Spend" value={asMoney(o.blendedSpend)} delta={o.blendedSpendDelta} comparisonExpected />
        <KpiCard
          title="Clicks"
          value={asNum(o.blendedClicks)}
          delta={o.blendedClicksDelta}
          comparisonExpected
          tooltip="Blended across every channel this client runs. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
        />
      </div>

      <p className="text-xs text-text-muted">
        Blended Spend and Clicks cover every paid channel this client runs, and are shown only
        when all of them report for the period.
      </p>

      <PaidMediaTrendChart trend={trend} />

      {/* Per-channel breakdown (item 11b). */}
      <div className="space-y-6">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">By Channel</p>
        {o.channels.map((c) => (
          <section key={c.key} className="space-y-3">
            <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{c.label}</h3>
            <div className="grid grid-cols-3 gap-3">
              <KpiCard title="Spend" value={asMoney(c.spend)} delta={c.spendDelta} comparisonExpected />
              <KpiCard title="Clicks" value={asNum(c.clicks)} delta={c.clicksDelta} comparisonExpected />
              <KpiCard title="Leads" value={asNum(c.leads)} delta={c.leadsDelta} comparisonExpected />
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
