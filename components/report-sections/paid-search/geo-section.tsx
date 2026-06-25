'use client'

import { useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import { usd, num } from '@/lib/paid-search/base'
import { cn } from '@/lib/utils'
import type { GeoRegion } from '@/lib/paid-search/types'

export function GeoSection({ rows }: { rows: GeoRegion[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const top10 = rows.slice(0, 10)

  const toggle = (region: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(region)) next.delete(region)
      else next.add(region)
      return next
    })

  const chartData = top10.map((r) => ({ region: r.region, leads: r.leads }))
  const yKeys = [{ key: 'leads', label: 'Leads', color: CHART_COLORS.googleAds }]
  const topRegion = top10[0] ?? null

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard title="Top Region" value={topRegion?.region ?? '—'} />
        <KpiCard title="Leads (Top Region)" value={topRegion?.leads ?? 0} />
        <KpiCard title="Total Regions" value={rows.length} />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Leads
        </p>
        {top10.length > 0 ? (
          <BarChart data={chartData} xKey="region" yKeys={yKeys} height={320} />
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
            No geo data available for this period.
          </div>
        )}
      </div>

      {top10.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
            Region → DMA Breakdown
          </p>
          <div className="overflow-hidden rounded-lg border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-text-muted">
                  <th className="px-4 py-2 text-left font-bold">Region / DMA</th>
                  <th className="px-4 py-2 text-right font-bold">Clicks</th>
                  <th className="px-4 py-2 text-right font-bold">Cost</th>
                  <th className="px-4 py-2 text-right font-bold">Leads</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r) => {
                  const isOpen = expanded.has(r.region)
                  return (
                    <FragmentRow
                      key={r.region}
                      region={r}
                      isOpen={isOpen}
                      onToggle={() => toggle(r.region)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentRow({
  region,
  isOpen,
  onToggle,
}: {
  region: GeoRegion
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
      >
        <td className="px-4 py-2.5 text-left font-medium text-white">
          <span className="inline-flex items-center gap-2">
            <ChevronRightIcon
              className={cn('h-3.5 w-3.5 text-text-muted transition-transform', isOpen && 'rotate-90')}
            />
            {region.region}
            <span className="text-xs text-text-muted">({region.dmas.length} DMA{region.dmas.length === 1 ? '' : 's'})</span>
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-white/80">{num(region.clicks)}</td>
        <td className="px-4 py-2.5 text-right text-white/80">{usd(region.cost)}</td>
        <td className="px-4 py-2.5 text-right font-semibold text-white">{num(region.leads)}</td>
      </tr>
      {isOpen &&
        region.dmas.map((dma) => (
          <tr key={`${region.region}-${dma.dma}`} className="border-b border-white/[0.03] bg-white/[0.015]">
            <td className="px-4 py-2 pl-11 text-left text-text-muted">{dma.dma}</td>
            <td className="px-4 py-2 text-right text-text-muted">{num(dma.clicks)}</td>
            <td className="px-4 py-2 text-right text-text-muted">{usd(dma.cost)}</td>
            <td className="px-4 py-2 text-right text-text-muted">{num(dma.leads)}</td>
          </tr>
        ))}
    </>
  )
}
