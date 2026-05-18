import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface EmailMarketingProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Sends', value: '48,250', delta: 6.2 },
  { title: 'Deliveries', value: '47,104', delta: 5.9 },
  { title: 'Open Rate', value: '38.4', suffix: '%', delta: 2.1 },
  { title: 'Click Rate', value: '4.8', suffix: '%', delta: 8.3 },
  { title: 'Unsubscribes', value: '142', delta: -15.2 },
  { title: 'Revenue', value: '12,840', prefix: '$', delta: 22.7 },
]

const DEMO_SENDS_VS_OPENS = [
  { campaign: 'Week 1', sends: 12400, opens: 4836 },
  { campaign: 'Week 2', sends: 11200, opens: 4256 },
  { campaign: 'Week 3', sends: 13100, opens: 5109 },
  { campaign: 'Week 4', sends: 11550, opens: 4504 },
]

const DEMO_OPEN_RATE_TREND = Array.from({ length: 12 }, (_, i) => ({
  date: `Week ${i + 1}`,
  openRate: +(35 + Math.random() * 8).toFixed(1),
  clickRate: +(3.5 + Math.random() * 3).toFixed(1),
}))

const DEMO_CAMPAIGNS = [
  { campaign: 'March Newsletter', sent: '12,400', openRate: '42.1%', clickRate: '5.8%', revenue: '$4,250', unsubscribes: '28' },
  { campaign: 'Flash Sale — 24hr', sent: '11,200', openRate: '48.3%', clickRate: '8.2%', revenue: '$5,120', unsubscribes: '45' },
  { campaign: 'Product Launch', sent: '13,100', openRate: '35.7%', clickRate: '3.9%', revenue: '$2,340', unsubscribes: '31' },
  { campaign: 'Winback Series #3', sent: '5,800', openRate: '28.4%', clickRate: '2.1%', revenue: '$680', unsubscribes: '22' },
  { campaign: 'Weekly Digest', sent: '5,750', openRate: '31.2%', clickRate: '3.4%', revenue: '$450', unsubscribes: '16' },
]

export async function EmailMarketingReport({ clientSlug, dateRange }: EmailMarketingProps) {
  // TODO: Replace with real smQuery calls using DS_IDS.MAILCHIMP or DS_IDS.KLAVIYO

  return (
    <div className="space-y-8">
      {/* Section heading */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Channel Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Email{' '}
          <span className="gradient-text-revenue">Marketing</span>
        </h2>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3">
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

      {/* Sends vs Opens + Open Rate Trend */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Sends vs Opens
          </h3>
          <BarChart
            data={DEMO_SENDS_VS_OPENS}
            xKey="campaign"
            yKeys={[
              { key: 'sends', color: CHART_COLORS.email, label: 'Sends' },
              { key: 'opens', color: CHART_COLORS.positive, label: 'Opens' },
            ]}
            height={280}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">
            Open &amp; Click Rate Trend
          </h3>
          <AreaChart
            data={DEMO_OPEN_RATE_TREND}
            xKey="date"
            yKeys={[
              { key: 'openRate', color: CHART_COLORS.email, label: 'Open Rate (%)' },
              { key: 'clickRate', color: CHART_COLORS.primary, label: 'Click Rate (%)' },
            ]}
            height={280}
          />
        </div>
      </div>

      {/* Campaign table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Top Campaigns</h3>
        <DataTable
          columns={[
            { key: 'campaign', label: 'Campaign' },
            { key: 'sent', label: 'Sent', align: 'right' },
            { key: 'openRate', label: 'Open Rate', align: 'right' },
            { key: 'clickRate', label: 'Click Rate', align: 'right' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'unsubscribes', label: 'Unsubs', align: 'right' },
          ]}
          rows={DEMO_CAMPAIGNS}
        />
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect your email platform to see real metrics
      </p>
    </div>
  )
}
