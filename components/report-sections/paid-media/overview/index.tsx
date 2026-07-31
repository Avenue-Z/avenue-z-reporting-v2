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
      {/* Combined top line — Spend, Clicks, Leads, Cost per Lead in that exact
          order (item 11a; CTR + Conversions excluded). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title="Spend" value={asMoney(o.blendedSpend)} />
        <KpiCard
          title="Clicks"
          value={asNum(o.blendedClicks)}
          tooltip="Blended across all three channels. Meta contributes link clicks; Paid Search and LinkedIn contribute all clicks."
        />
        <KpiCard title="Leads" value={o.leads == null ? dash : num(o.leads)} />
        <KpiCard title="Cost per Lead" value={o.costPerLead == null ? dash : money(o.costPerLead)} />
      </div>

      <p className="text-xs text-text-muted">
        Leads and Cost per lead are pending a HubSpot lead attribution definition.
        Blended Spend and Clicks are shown only when all three channels report.
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
              </tr>
            </thead>
            <tbody>
              {o.channels.map((c) => (
                <tr key={c.key} className="border-b border-white/[0.04] last:border-b-0">
                  <td className="px-4 py-2.5 text-left font-medium text-white">{c.label}</td>
                  <td className="px-4 py-2.5 text-right text-white/80">{asMoney(c.spend)}</td>
                  <td className="px-4 py-2.5 text-right text-white/80">{asNum(c.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
