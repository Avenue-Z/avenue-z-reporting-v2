import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import type { LinkedInGeoRow } from '@/lib/linkedin/types'
import { usd } from '@/lib/supermetrics/format'

export function LinkedInGeoSection({ rows }: { rows: LinkedInGeoRow[] }) {
  const top10 = rows.slice(0, 10)
  const chartData = top10.map((r) => ({ region: r.region, spend: r.spend }))
  const yKeys = [{ key: 'spend', label: 'Spend', color: CHART_COLORS.linkedin }]
  const topRegion = top10[0] ?? null
  const totalGeos = rows.length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard title="Top Region" value={topRegion?.region ?? '—'} />
        <KpiCard title="Spend (Top Region)" value={topRegion ? usd(topRegion.spend) : '—'} />
        <KpiCard title="Total Regions" value={totalGeos} />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Spend
        </p>
        {top10.length > 0 ? (
          <BarChart data={chartData} xKey="region" yKeys={yKeys} height={320} />
        ) : (
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-center text-sm text-text-muted">
            No geo data available for this period.
          </div>
        )}
      </div>
    </div>
  )
}
