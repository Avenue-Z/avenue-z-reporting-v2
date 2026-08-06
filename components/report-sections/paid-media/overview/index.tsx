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
      {/* Combined top line — Spend, Clicks, Leads, Cost per Lead (item 11a order). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title="Spend" value={asMoney(o.blendedSpend)} delta={o.blendedSpendDelta} comparisonExpected />
        <KpiCard
          title="Clicks"
          value={asNum(o.blendedClicks)}
          delta={o.blendedClicksDelta}
          comparisonExpected
          tooltip="Blended across the channels this client runs. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
        />
        <KpiCard title="Leads" value={asNum(o.blendedLeads)} delta={o.blendedLeadsDelta} comparisonExpected />
        <KpiCard title="Cost per Lead" value={asMoney(o.blendedCostPerLead)} delta={o.blendedCostPerLeadDelta} comparisonExpected invertDelta />
      </div>

      <p className="text-xs text-text-muted">
        Blended Spend and Clicks are shown only when every channel this client runs reports.
        Leads and Cost per Lead are blended across Paid Search and LinkedIn only — Meta lead
        conversions aren&rsquo;t tracked, so Meta is excluded from those two figures. Because
        Spend includes every channel but Cost per Lead uses only Paid Search + LinkedIn spend,
        Cost per Lead won&rsquo;t equal Spend &divide; Leads; a channel currently reporting 0 leads
        still contributes its spend to the blend. Spend/Clicks and Leads/Cost per Lead are gated
        independently, so one pair may show a value while the other shows &lsquo;—&rsquo;.
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
