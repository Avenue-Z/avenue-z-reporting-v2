// Paid Media Overview — the default landing subpage (item 5). Rolls up Paid
// Search, Meta, and LinkedIn into a combined top line plus a per-channel
// breakdown (items 1, 11a, 11b). It deliberately does NOT render a
// SharedPartsHeader: the Overview has no commentary box (item 6). The section is
// wrapped in ReportErrorBoundary at the page level, and getPaidMediaOverview
// uses Promise.allSettled, so one failed channel never crashes the page.

import { KpiCard } from '@/components/charts/kpi-card'
import { getPaidMediaOverview } from '@/lib/paid-media/overview'
import { money } from '@/lib/paid-media/format'
import { num } from '@/lib/supermetrics/format'

const dash = '—'
const asMoney = (n: number | null) => (n == null ? dash : money(n))
const asNum = (n: number | null) => (n == null ? dash : num(n))

export async function PaidMediaOverviewReport({
  clientSlug,
  dateRange = 'last_30_days',
}: {
  clientSlug: string
  dateRange?: string
}) {
  const o = await getPaidMediaOverview(clientSlug, dateRange)

  return (
    <div className="space-y-8">
      {/* Combined top line — Spend, Clicks, Leads, Cost per Lead (item 11a order). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title="Spend" value={asMoney(o.blendedSpend)} />
        <KpiCard
          title="Clicks"
          value={asNum(o.blendedClicks)}
          tooltip="Blended across the channels this client runs. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
        />
        <KpiCard title="Leads" value={asNum(o.blendedLeads)} />
        <KpiCard title="Cost per Lead" value={asMoney(o.blendedCostPerLead)} />
      </div>

      <p className="text-xs text-text-muted">
        Blended Spend and Clicks are shown only when every channel this client runs reports.
        Leads and Cost per Lead are blended across Paid Search and LinkedIn only — Meta lead
        conversions aren&rsquo;t tracked, so Meta is excluded from those two figures.
      </p>

      {/* Per-channel breakdown (item 11b). */}
      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          By Channel
        </p>
        <div className="overflow-hidden rounded-lg border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-text-muted">
                <th className="px-4 py-2 text-left font-bold">Channel</th>
                <th className="px-4 py-2 text-right font-bold">Spend</th>
                <th className="px-4 py-2 text-right font-bold">Clicks</th>
                <th className="px-4 py-2 text-right font-bold">Leads</th>
              </tr>
            </thead>
            <tbody>
              {o.channels.map((c) => (
                <tr key={c.key} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-2.5 text-left font-medium text-white">{c.label}</td>
                  <td className="px-4 py-2.5 text-right text-white/80">{asMoney(c.spend)}</td>
                  <td className="px-4 py-2.5 text-right text-white/80">{asNum(c.clicks)}</td>
                  <td className="px-4 py-2.5 text-right text-white/80">{asNum(c.leads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Clicks are link clicks for Meta and all clicks for Paid Search and
          LinkedIn. Leads are shown per channel where available. Meta
          lead conversions are not available, so Meta shows &lsquo;—&rsquo;.
        </p>
      </div>
    </div>
  )
}
