import { BarChart } from '@/components/charts/bar-chart'
import { KpiCard } from '@/components/charts/kpi-card'
import { CHART_COLORS } from '@/lib/constants'
import type { MetaGeoData } from '@/lib/meta/geo'
import { usd } from '@/lib/supermetrics/format'

function pctDelta(cur: number, prev: number | null): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

export function MetaGeoSection({ data }: { data: MetaGeoData }) {
  const { rows, totalRegions, prevTopRegionSpend, prevTotalRegions } = data
  const top10 = rows.slice(0, 10)

  const chartData = top10.map((r) => ({
    region: r.region,
    spend: r.spend,
  }))

  const yKeys = [
    { key: 'spend', label: 'Spend', color: CHART_COLORS.metaAds },
  ]

  const topRegion = top10[0] ?? null
  const spendDelta = topRegion ? pctDelta(topRegion.spend, prevTopRegionSpend) : undefined
  const regionsDelta = pctDelta(totalRegions, prevTotalRegions)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KpiCard
          title="Top Region"
          value={topRegion?.region ?? '—'}
        />
        <KpiCard
          title="Spend (Top Region)"
          value={topRegion ? usd(topRegion.spend) : '—'}
          delta={spendDelta}
        />
        <KpiCard
          title="Total Regions"
          value={totalRegions}
          delta={regionsDelta}
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          Top Regions by Spend
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
