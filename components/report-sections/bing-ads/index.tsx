import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface BingAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '284,120', delta: 11.2 },
  { title: 'Clicks', value: '12,480', delta: 14.8 },
  { title: 'CTR', value: '4.39', suffix: '%', delta: 3.2 },
  { title: 'CPC', value: '0.94', prefix: '$', delta: -7.5 },
  { title: 'Spend', value: '11,731', prefix: '$', delta: 6.4 },
  { title: 'Conversions', value: '684', delta: 19.2 },
  { title: 'CPA', value: '17.15', prefix: '$', delta: -10.7 },
  { title: 'Conv. Rate', value: '5.48', suffix: '%', delta: 3.8 },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  clicks: Math.floor(320 + Math.random() * 150 + i * 8),
  conversions: Math.floor(16 + Math.random() * 12 + i),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Brand — Exact Match', network: 'Search', spend: '$2,840', clicks: '3,920', ctr: '8.42%', conversions: '284', cpa: '$10.00' },
  { campaign: 'Non-Brand — Services', network: 'Search', spend: '$3,680', clicks: '3,450', ctr: '3.68%', conversions: '182', cpa: '$20.22' },
  { campaign: 'Shopping — All Products', network: 'Shopping', spend: '$2,410', clicks: '2,840', ctr: '2.94%', conversions: '124', cpa: '$19.44' },
  { campaign: 'Audience Ads — Remarketing', network: 'Audience', spend: '$1,620', clicks: '1,420', ctr: '0.92%', conversions: '58', cpa: '$27.93' },
  { campaign: 'DSA — Blog', network: 'Search', spend: '$1,181', clicks: '850', ctr: '4.12%', conversions: '36', cpa: '$32.81' },
]

export async function BingAdsReport({ clientSlug, dateRange }: BingAdsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Microsoft Advertising
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Microsoft{' '}
          <span className="gradient-text-reputation">Ads</span>
        </h2>
      </div>

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

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Clicks &amp; Conversions Trend</h3>
        <AreaChart
          data={DEMO_TREND}
          xKey="date"
          yKeys={[
            { key: 'clicks', color: CHART_COLORS.bingAds, label: 'Clicks' },
            { key: 'conversions', color: CHART_COLORS.positive, label: 'Conversions' },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'network', label: 'Network' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect Microsoft Ads to see real metrics</p>
    </div>
  )
}
