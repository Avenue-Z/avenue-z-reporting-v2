import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface LinkedInAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '312,450', delta: 18.4, accent: 'reputation' as const },
  { title: 'Clicks', value: '4,821', delta: 14.2, accent: 'reputation' as const },
  { title: 'CTR', value: '1.54', suffix: '%', delta: 6.1, accent: 'reputation' as const },
  { title: 'CPC', value: '4.82', prefix: '$', delta: -3.8, accent: 'revenue' as const },
  { title: 'Spend', value: '23,237', prefix: '$', delta: 8.5, accent: 'revenue' as const },
  { title: 'Conversions', value: '218', delta: 24.3, accent: 'revenue' as const },
  { title: 'CPA', value: '106.59', prefix: '$', delta: -12.7, accent: 'revenue' as const },
  { title: 'Leads', value: '342', delta: 19.8, accent: 'revenue' as const },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  impressions: Math.floor(8000 + Math.random() * 4000 + i * 200),
  clicks: Math.floor(120 + Math.random() * 60 + i * 5),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Decision Makers — SaaS', format: 'Sponsored Content', spend: '$8,420', clicks: '1,840', ctr: '1.72%', conversions: '92', cpa: '$91.52' },
  { campaign: 'Retargeting — Site Visitors', format: 'Sponsored Content', spend: '$5,200', clicks: '1,210', ctr: '2.14%', conversions: '68', cpa: '$76.47' },
  { campaign: 'ABM — Enterprise List', format: 'Message Ads', spend: '$4,800', clicks: '890', ctr: '1.28%', conversions: '34', cpa: '$141.18' },
  { campaign: 'Thought Leadership', format: 'Document Ads', spend: '$4,817', clicks: '881', ctr: '1.15%', conversions: '24', cpa: '$200.71' },
]

export async function LinkedInAdsReport({ clientSlug, dateRange }: LinkedInAdsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          B2B Advertising
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          LinkedIn{' '}
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
          <h3 className="mb-4 text-lg font-bold text-white">Impressions Trend</h3>
          <AreaChart
            data={DEMO_TREND}
            xKey="date"
            yKeys={[{ key: 'impressions', color: CHART_COLORS.linkedin, label: 'Impressions' }]}
            height={280}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Clicks Trend</h3>
          <BarChart
            data={DEMO_TREND}
            xKey="date"
            yKeys={[{ key: 'clicks', color: CHART_COLORS.linkedin, label: 'Clicks' }]}
            height={280}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'format', label: 'Format' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'ctr', label: 'CTR', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'cpa', label: 'CPA', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect LinkedIn Ads to see real metrics</p>
    </div>
  )
}
