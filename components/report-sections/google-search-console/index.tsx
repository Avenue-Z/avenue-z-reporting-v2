import { getGSCOverview } from '@/lib/gsc/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface SearchConsoleProps {
  clientSlug: string
}

function fmtNum(n: number): string {
  return Math.round(n).toLocaleString()
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function fmtPos(n: number): string {
  return n.toFixed(1)
}

export async function GoogleSearchConsoleReport({ clientSlug }: SearchConsoleProps) {
  const data = await getGSCOverview(clientSlug)
  const { kpis, trend, topQueries, topPages, dateRange } = data

  const kpiCards = [
    {
      title: 'Total Clicks',
      value: fmtNum(kpis.clicks),
      delta: kpis.clicksDelta,
    },
    {
      title: 'Total Impressions',
      value: fmtNum(kpis.impressions),
      delta: kpis.impressionsDelta,
    },
    {
      title: 'Avg CTR',
      value: fmtPct(kpis.ctr),
      delta: kpis.ctrDelta,
    },
    {
      title: 'Avg Position',
      value: fmtPos(kpis.position),
      delta: kpis.positionDelta,
    },
  ]

  const trendData = trend.map((r) => ({
    date: new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
    clicks: r.clicks,
    impressions: r.impressions,
  }))

  const queryRows = topQueries.map((r) => ({
    query: r.query,
    clicks: fmtNum(r.clicks),
    impressions: fmtNum(r.impressions),
    ctr: fmtPct(r.ctr),
    position: fmtPos(r.position),
  }))

  const pageRows = topPages.map((r) => ({
    page: r.page.replace(/^https?:\/\/[^/]+/, ''),
    clicks: fmtNum(r.clicks),
    impressions: fmtNum(r.impressions),
    ctr: fmtPct(r.ctr),
    position: fmtPos(r.position),
  }))

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Organic Search
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Search{' '}
          <span className="gradient-text-reputation">Console</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            delta={kpi.delta ?? undefined}
          />
        ))}
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Clicks &amp; Impressions Over Time
        </h3>
        <AreaChart
          data={trendData}
          xKey="date"
          yKeys={[
            { key: 'clicks', color: CHART_COLORS.ga4, label: 'Clicks' },
            { key: 'impressions', color: CHART_COLORS.primary, label: 'Impressions' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Top Queries</h3>
          <DataTable
            columns={[
              { key: 'query', label: 'Query' },
              { key: 'clicks', label: 'Clicks', align: 'right' },
              { key: 'impressions', label: 'Impressions', align: 'right' },
              { key: 'ctr', label: 'CTR', align: 'right' },
              { key: 'position', label: 'Position', align: 'right' },
            ]}
            rows={queryRows}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Top Pages</h3>
          <DataTable
            columns={[
              { key: 'page', label: 'Page' },
              { key: 'clicks', label: 'Clicks', align: 'right' },
              { key: 'impressions', label: 'Impressions', align: 'right' },
              { key: 'ctr', label: 'CTR', align: 'right' },
              { key: 'position', label: 'Position', align: 'right' },
            ]}
            rows={pageRows}
          />
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Last 28 days ending {dateRange.end} vs prior 28-day period · Data via Google Search Console
      </p>
    </div>
  )
}
