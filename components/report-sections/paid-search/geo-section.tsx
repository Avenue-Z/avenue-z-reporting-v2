import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import type { GeoRow } from '@/lib/paid-search/types'

export function GeoSection({ rows }: { rows: GeoRow[] }) {
  const top10 = rows.slice(0, 10)

  const chartData = top10.map((r) => ({
    region: r.region,
    leads: r.leads,
  }))

  const yKeys = [
    { key: 'leads', label: 'Leads', color: CHART_COLORS.googleAds },
  ]

  const topRegion = top10[0] ?? null
  const totalGeos = rows.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          title="Top Region"
          value={topRegion?.region ?? '—'}
        />
        <KpiCard
          title="Leads (Top Region)"
          value={topRegion?.leads ?? 0}
        />
        <KpiCard
          title="Total Regions"
          value={totalGeos}
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Leads
        </p>
        {top10.length > 0 ? (
          <BarChart
            data={chartData}
            xKey="region"
            yKeys={yKeys}
            height={320}
          />
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
            No geo data available for this period.
          </div>
        )}
      </div>
    </div>
  )
}
