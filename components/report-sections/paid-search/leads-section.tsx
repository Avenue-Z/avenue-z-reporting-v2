'use client'
import { ComboChart } from '@/components/charts/combo-chart'
import { pct } from '@/lib/supermetrics/format'
import { bucketLabel } from '@/lib/paid-search/week-label'
import { CHART_COLORS } from '@/lib/constants'
import type { LeadBreakdown } from '@/lib/paid-search/types'
import type { LeadCategory } from '@/lib/db/schema'

const CATEGORIES: LeadCategory[] = ['employer', 'broker', 'contact']

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function LeadsSection({ data }: { data: LeadBreakdown }) {
  return (
    <div className="space-y-6">
      {/* Weekly leads chart */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
          Leads Over Time
        </h3>
        <ComboChart
          data={data.trend}
          xKey="bucket"
          xFormatter={bucketLabel}
          bar={{ key: 'leads', color: CHART_COLORS.googleAds, label: 'Leads' }}
        />
      </div>

      {/* By-action breakdown grouped by category */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-text-muted">
          Leads by Action
        </h3>
        {/* Total Leads at the top — sum of the category subtotals (Req 2). Uses
            the already-computed total; unaffected by the keyword ≥10 filter,
            which lives on a separate table and data path (comment [e]/[f]). */}
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.12] pb-3">
          <span className="text-sm font-bold text-white">Total Leads</span>
          <span className="tabular-nums text-base font-bold text-white">
            {data.totalLeads.toLocaleString('en-US')}
          </span>
        </div>
        <div className="space-y-6">
          {CATEGORIES.map((category) => {
            const actions = data.byAction.filter((a) => a.category === category)
            const subtotal = data.categoryTotals[category] ?? 0
            const share =
              data.totalLeads > 0
                ? pct((subtotal / data.totalLeads) * 100)
                : '0.0%'

            return (
              <div key={category}>
                {/* Category header */}
                <div className="mb-2 flex items-center justify-between border-b border-white/[0.08] pb-2">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
                    {capitalize(category)}
                  </span>
                  <span className="text-xs text-text-muted">{share} of leads</span>
                </div>

                {/* Action rows */}
                <div className="space-y-1">
                  {actions.map((action) => (
                    <div
                      key={action.name}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm text-white/80">{action.name}</span>
                      <span className="tabular-nums text-sm text-white">
                        {action.count.toLocaleString('en-US')}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Subtotal */}
                <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
                  <span className="text-sm font-semibold text-white">Subtotal</span>
                  <span className="tabular-nums text-sm font-semibold text-white">
                    {subtotal.toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
