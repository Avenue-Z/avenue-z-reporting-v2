import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface RedditAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '1,124,500', delta: 28.4, accent: 'reputation' as const },
  { title: 'Clicks', value: '18,920', delta: 21.3, accent: 'reputation' as const },
  { title: 'CTR', value: '1.68', suffix: '%', delta: 7.2, accent: 'reputation' as const },
  { title: 'CPC', value: '0.52', prefix: '$', delta: -9.8, accent: 'revenue' as const },
  { title: 'Spend', value: '9,838', prefix: '$', delta: 14.1, accent: 'revenue' as const },
  { title: 'Conversions', value: '384', delta: 32.8, accent: 'revenue' as const },
  { title: 'CPA', value: '25.62', prefix: '$', delta: -14.1, accent: 'revenue' as const },
  { title: 'Video Views', value: '342,100', delta: 45.2, accent: 'reputation' as const },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  spend: Math.floor(250 + Math.random() * 120 + i * 5),
  conversions: Math.floor(8 + Math.random() * 8 + i * 0.5),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Promoted Posts — r/technology', targeting: 'Interest', spend: '$3,420', clicks: '6,840', ctr: '1.82%', conversions: '148', cpa: '$23.11' },
  { campaign: 'Conversation Ads — r/startups', targeting: 'Community', spend: '$2,810', clicks: '5,210', ctr: '1.74%', conversions: '112', cpa: '$25.09' },
  { campaign: 'Video Ads — Brand Awareness', targeting: 'Broad', spend: '$2,108', clicks: '4,120', ctr: '1.48%', conversions: '78', cpa: '$27.03' },
  { campaign: 'Retargeting — Site Visitors', targeting: 'Pixel', spend: '$1,500', clicks: '2,750', ctr: '2.14%', conversions: '46', cpa: '$32.61' },
]

export async function RedditAdsReport({ clientSlug, dateRange }: RedditAdsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Community Advertising
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Reddit{' '}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Daily Spend</h3>
          <BarChart
            data={DEMO_TREND}
            xKey="date"
            yKeys={[{ key: 'spend', color: CHART_COLORS.reddit, label: 'Spend ($)' }]}
            height={280}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Conversions Trend</h3>
          <AreaChart
            data={DEMO_TREND}
            xKey="date"
            yKeys={[{ key: 'conversions', color: CHART_COLORS.positive, label: 'Conversions' }]}
            height={280}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'targeting', label: 'Targeting' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect Reddit Ads to see real metrics</p>
    </div>
  )
}
