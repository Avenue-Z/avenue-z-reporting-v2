import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface SnapchatAdsProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Impressions', value: '1,842,300', delta: 22.1, accent: 'reputation' as const },
  { title: 'Swipe Ups', value: '28,410', delta: 15.8, accent: 'reputation' as const },
  { title: 'Swipe Up Rate', value: '1.54', suffix: '%', delta: 4.3, accent: 'reputation' as const },
  { title: 'eCPM', value: '3.21', prefix: '$', delta: -8.2, accent: 'revenue' as const },
  { title: 'Spend', value: '5,915', prefix: '$', delta: 12.4, accent: 'revenue' as const },
  { title: 'Conversions', value: '412', delta: 28.9, accent: 'revenue' as const },
  { title: 'Cost / Swipe Up', value: '0.21', prefix: '$', delta: -11.3, accent: 'revenue' as const },
  { title: 'ROAS', value: '3.8', suffix: 'x', delta: 14.7, accent: 'full' as const },
]

const DEMO_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  spend: Math.floor(150 + Math.random() * 80 + i * 3),
  swipeUps: Math.floor(700 + Math.random() * 400 + i * 20),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'Story Ads — Gen Z Reach', spend: '$2,140', impressions: '682,100', swipeUps: '11,240', rate: '1.65%', conversions: '178', roas: '4.2x' },
  { campaign: 'Collection Ads — Products', spend: '$1,890', impressions: '524,300', swipeUps: '8,920', rate: '1.70%', conversions: '142', roas: '3.9x' },
  { campaign: 'AR Lens — Brand Awareness', spend: '$1,085', impressions: '412,800', swipeUps: '5,340', rate: '1.29%', conversions: '58', roas: '2.8x' },
  { campaign: 'Commercials — Retargeting', spend: '$800', impressions: '223,100', swipeUps: '2,910', rate: '1.30%', conversions: '34', roas: '3.1x' },
]

export async function SnapchatAdsReport({ clientSlug, dateRange }: SnapchatAdsProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Paid Social Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Snapchat{' '}
          <span className="gradient-text-revenue">Ads</span>
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
            yKeys={[{ key: 'spend', color: CHART_COLORS.snapchat, label: 'Spend ($)' }]}
            height={280}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Swipe Ups Trend</h3>
          <AreaChart
            data={DEMO_TREND}
            xKey="date"
            yKeys={[{ key: 'swipeUps', color: CHART_COLORS.snapchat, label: 'Swipe Ups' }]}
            height={280}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Campaign Breakdown</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'impressions', label: 'Impressions', align: 'right' },
            { key: 'swipeUps', label: 'Swipe Ups', align: 'right' },
            { key: 'rate', label: 'Rate', align: 'right' },
            { key: 'conversions', label: 'Conv.', align: 'right' },
            { key: 'roas', label: 'ROAS', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect Snapchat Ads to see real metrics</p>
    </div>
  )
}
