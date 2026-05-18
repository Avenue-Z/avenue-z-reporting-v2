import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface TikTokAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '2,412,800', delta: 34.2, accent: 'reputation' as const },
  { title: 'Video Views', value: '1,892,340', delta: 28.7, accent: 'reputation' as const },
  { title: 'Clicks', value: '42,180', delta: 19.3, accent: 'reputation' as const },
  { title: 'CTR', value: '1.75', suffix: '%', delta: 5.8, accent: 'reputation' as const },
  { title: 'CPC', value: '0.38', prefix: '$', delta: -14.2, accent: 'revenue' as const },
  { title: 'Spend', value: '16,028', prefix: '$', delta: 11.8, accent: 'revenue' as const },
  { title: 'Conversions', value: '1,124', delta: 32.4, accent: 'revenue' as const },
  { title: 'CPA', value: '14.26', prefix: '$', delta: -15.7, accent: 'revenue' as const },
  { title: 'ROAS', value: '4.8', suffix: 'x', delta: 21.3, accent: 'full' as const },
  { title: 'Avg Watch Time', value: '8.4', suffix: 's', delta: 12.1, accent: 'reputation' as const },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  spend: Math.floor(400 + Math.random() * 200 + i * 8),
  conversions: Math.floor(25 + Math.random() * 20 + i * 2),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Spark Ads — UGC', objective: 'Conversions', spend: '$5,840', views: '682,100', clicks: '15,420', ctr: '2.26%', conversions: '485', cpa: '$12.04' },
  { campaign: 'In-Feed — Product Launch', objective: 'Conversions', spend: '$4,200', views: '521,400', clicks: '12,180', ctr: '2.34%', conversions: '342', cpa: '$12.28' },
  { campaign: 'TopView — Brand', objective: 'Reach', spend: '$3,480', views: '412,300', clicks: '8,240', ctr: '2.00%', conversions: '198', cpa: '$17.58' },
  { campaign: 'Branded Hashtag', objective: 'Awareness', spend: '$2,508', views: '276,540', clicks: '6,340', ctr: '1.12%', conversions: '99', cpa: '$25.33' },
]

export async function TikTokAdsReport({ clientSlug, dateRange }: TikTokAdsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Short-Form Video Advertising
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          TikTok{' '}
          <span className="gradient-text-full">Ads</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
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
            yKeys={[{ key: 'spend', color: CHART_COLORS.tiktok, label: 'Spend ($)' }]}
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
            { key: 'objective', label: 'Objective' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'views', label: 'Views', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect TikTok Ads to see real metrics</p>
    </div>
  )
}
