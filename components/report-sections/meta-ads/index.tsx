import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface MetaAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '842,190', delta: 14.2, accent: 'reputation' as const },
  { title: 'Reach', value: '423,891', delta: 9.8, accent: 'reputation' as const },
  { title: 'CPM', value: '8.42', prefix: '$', delta: -5.1, accent: 'revenue' as const },
  { title: 'Clicks', value: '18,432', delta: 11.3, accent: 'reputation' as const },
  { title: 'CTR', value: '2.19', suffix: '%', delta: 4.7, accent: 'reputation' as const },
  { title: 'CPC', value: '0.68', prefix: '$', delta: -8.2, accent: 'revenue' as const },
  { title: 'Spend', value: '7,095', prefix: '$', delta: 3.4, accent: 'revenue' as const },
  { title: 'Conversions', value: '892', delta: 18.6, accent: 'revenue' as const },
  { title: 'CPA', value: '7.95', prefix: '$', delta: -12.8, accent: 'revenue' as const },
  { title: 'ROAS', value: '4.2', suffix: 'x', delta: 15.3, accent: 'full' as const },
  { title: 'Frequency', value: '1.99', delta: 4.5, accent: 'reputation' as const },
]

const DEMO_SPEND_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  spend: Math.floor(180 + Math.random() * 80),
  conversions: Math.floor(20 + Math.random() * 20),
}))

const DEMO_CTR_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  ctr: +(1.8 + Math.random() * 0.8).toFixed(2),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Prospecting — Broad', spend: '$2,340', impressions: '312,400', clicks: '6,820', ctr: '2.18%', conversions: '342', cpa: '$6.84', roas: '4.8x' },
  { campaign: 'Retargeting — Site Visitors', spend: '$1,890', impressions: '145,200', clicks: '4,510', ctr: '3.11%', conversions: '285', cpa: '$6.63', roas: '5.2x' },
  { campaign: 'Lookalike — Purchasers', spend: '$1,650', impressions: '218,900', clicks: '4,230', ctr: '1.93%', conversions: '168', cpa: '$9.82', roas: '3.1x' },
  { campaign: 'Brand Awareness', spend: '$1,215', impressions: '165,690', clicks: '2,872', ctr: '1.73%', conversions: '97', cpa: '$12.53', roas: '2.4x' },
]

export async function MetaAdsReport({ clientSlug, dateRange }: MetaAdsProps) {
  // TODO: Replace with real smQuery calls using DS_IDS.META

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Paid Social Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Meta{' '}
          <span className="gradient-text-reputation">Ads</span>
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

      {/* Spend vs Conversions + CTR Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Daily Spend &amp; Conversions
          </h3>
          <BarChart
            data={DEMO_SPEND_TREND}
            xKey="date"
            yKeys={[
              { key: 'spend', color: CHART_COLORS.metaAds, label: 'Spend ($)' },
              { key: 'conversions', color: CHART_COLORS.positive, label: 'Conversions' },
            ]}
            height={280}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            CTR Trend
          </h3>
          <AreaChart
            data={DEMO_CTR_TREND}
            xKey="date"
            yKeys={[
              { key: 'ctr', color: CHART_COLORS.primary, label: 'CTR (%)' },
            ]}
            height={280}
          />
        </div>
      </div>

      {/* Campaign table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'impressions', label: 'Impressions', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
            { key: 'roas', label: 'ROAS', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect Meta Ads to see real metrics
      </p>
    </div>
  )
}
