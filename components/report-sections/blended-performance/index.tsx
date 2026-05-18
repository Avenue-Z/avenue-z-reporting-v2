import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DonutChart } from '@/components/charts/donut-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface BlendedPerformanceProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Total Spend', value: '32,684', prefix: '$', delta: 4.2 },
  { title: 'Blended CPA', value: '14.38', prefix: '$', delta: -9.7 },
  { title: 'Blended ROAS', value: '3.8', suffix: 'x', delta: 11.4 },
  { title: 'Total Conversions', value: '2,273', delta: 16.8 },
]

const DEMO_SPEND_BY_CHANNEL = Array.from({ length: 12 }, (_, i) => ({
  date: `Week ${i + 1}`,
  metaAds: Math.floor(1400 + Math.random() * 400),
  googleAds: Math.floor(1800 + Math.random() * 500),
  email: Math.floor(200 + Math.random() * 100),
  linkedin: Math.floor(300 + Math.random() * 150),
}))

const DEMO_SPEND_SHARE = [
  { name: 'Google Ads', value: 45, color: CHART_COLORS.googleAds },
  { name: 'Meta Ads', value: 32, color: CHART_COLORS.metaAds },
  { name: 'LinkedIn', value: 15, color: CHART_COLORS.linkedin },
  { name: 'Email', value: 8, color: CHART_COLORS.email },
]

const DEMO_FUNNEL = [
  { channel: 'Google Ads', impressions: '534,120', clicks: '22,847', conversions: '1,234', spend: '$25,589', roas: '3.2x' },
  { channel: 'Meta Ads', impressions: '842,190', clicks: '18,432', conversions: '892', spend: '$7,095', roas: '4.2x' },
  { channel: 'LinkedIn Ads', impressions: '124,500', clicks: '3,210', conversions: '85', spend: '$4,820', roas: '1.4x' },
  { channel: 'Email', impressions: '47,104', clicks: '2,261', conversions: '62', spend: '$180', roas: '71.3x' },
  { channel: 'Total', impressions: '1,547,914', clicks: '46,750', conversions: '2,273', spend: '$32,684', roas: '3.8x' },
]

export async function BlendedPerformanceReport({ clientSlug, dateRange }: BlendedPerformanceProps) {
  // TODO: Replace with aggregated smQuery calls across all connected data sources

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Cross-Channel View
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Blended{' '}
          <span className="gradient-text-full">Performance</span>
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

      {/* Spend by channel over time + Spend share donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Spend by Channel Over Time
          </h3>
          <AreaChart
            data={DEMO_SPEND_BY_CHANNEL}
            xKey="date"
            yKeys={[
              { key: 'googleAds', color: CHART_COLORS.googleAds, label: 'Google Ads' },
              { key: 'metaAds', color: CHART_COLORS.metaAds, label: 'Meta Ads' },
              { key: 'linkedin', color: CHART_COLORS.linkedin, label: 'LinkedIn' },
              { key: 'email', color: CHART_COLORS.email, label: 'Email' },
            ]}
            height={320}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Spend Share by Channel
          </h3>
          <DonutChart data={DEMO_SPEND_SHARE} height={320} />
        </div>
      </div>

      {/* Channel funnel table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Channel Attribution
        </h3>
        <DataTable
          columns={[
            { key: 'channel', label: 'Channel' },
            { key: 'impressions', label: 'Impressions', align: 'right' },
            { key: 'clicks', label: 'Clicks', align: 'right' },
            { key: 'conversions', label: 'Conversions', align: 'right' },
            { key: 'spend', label: 'Spend', align: 'right' },
            { key: 'roas', label: 'ROAS', align: 'right' },
          ]}
          rows={DEMO_FUNNEL}
        />
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect all platforms to see blended real metrics
      </p>
    </div>
  )
}
