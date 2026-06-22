import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface GoogleAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '534,120', delta: 8.9 },
  { title: 'Clicks', value: '22,847', delta: 12.4 },
  { title: 'CTR', value: '4.28', suffix: '%', delta: 3.2 },
  { title: 'CPC', value: '1.12', prefix: '$', delta: -6.5 },
  { title: 'Spend', value: '25,589', prefix: '$', delta: 5.1 },
  { title: 'Conversions', value: '1,234', delta: 19.7 },
  { title: 'CPA', value: '20.74', prefix: '$', delta: -12.2 },
  { title: 'Conv. Rate', value: '5.40', suffix: '%', delta: 6.5 },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  clicks: Math.floor(600 + Math.random() * 300 + i * 10),
  conversions: Math.floor(30 + Math.random() * 20 + i * 1.5),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Brand — Exact Match', type: 'Search', spend: '$4,200', clicks: '5,840', ctr: '8.12%', conversions: '412', cpa: '$10.19' },
  { campaign: 'Non-Brand — Services', type: 'Search', spend: '$8,450', clicks: '7,210', ctr: '3.45%', conversions: '385', cpa: '$21.95' },
  { campaign: 'PMax — All Products', type: 'PMax', spend: '$6,800', clicks: '5,120', ctr: '2.89%', conversions: '248', cpa: '$27.42' },
  { campaign: 'Display — Remarketing', type: 'Display', spend: '$3,200', clicks: '2,840', ctr: '0.78%', conversions: '112', cpa: '$28.57' },
  { campaign: 'DSA — Blog Content', type: 'Search', spend: '$2,939', clicks: '1,837', ctr: '4.21%', conversions: '77', cpa: '$38.17' },
]

export async function GoogleAdsReport({ clientSlug, dateRange }: GoogleAdsProps) {
  // TODO: Replace with real smQuery calls using DS_IDS.GOOGLE_ADS

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Paid Search Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Google{' '}
          <span className="gradient-text-revenue">Ads</span>
        </h2>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {DEMO_KPIS.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            delta={kpi.delta}
            prefix={kpi.prefix}
            suffix={kpi.suffix}

          />
        ))}
      </div>

      {/* Clicks & Conversions trend */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Clicks &amp; Conversions Trend
        </h3>
        <AreaChart
          data={DEMO_TREND}
          xKey="date"
          yKeys={[
            { key: 'clicks', color: CHART_COLORS.googleAds, label: 'Clicks' },
            { key: 'conversions', color: CHART_COLORS.positive, label: 'Conversions' },
          ]}
        />
      </div>

      {/* Campaign table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'type', label: 'Type' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect Google Ads to see real metrics
      </p>
    </div>
  )
}
