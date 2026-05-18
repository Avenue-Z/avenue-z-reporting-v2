import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { CHART_COLORS } from '@/lib/constants'

interface GoHighLevelReportProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Contacts Created', value: '1,284', delta: 18.3 },
  { title: 'Opportunities', value: '342', delta: 12.7 },
  { title: 'Pipeline Value', value: '248,500', delta: 22.1, prefix: '$' },
  { title: 'Deals Won', value: '67', delta: 8.4 },
  { title: 'Revenue Closed', value: '142,800', delta: 15.6, prefix: '$' },
  { title: 'Win Rate', value: '19.6', delta: 3.2, suffix: '%' },
  { title: 'Avg Deal Size', value: '2,131', delta: 6.8, prefix: '$' },
  { title: 'Response Time', value: '2.4', delta: -12.1, suffix: ' hrs' },
]

const DEMO_PIPELINE = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  contacts: Math.floor(30 + Math.random() * 25 + i * 1.5),
  opportunities: Math.floor(8 + Math.random() * 8 + i * 0.5),
  deals: Math.floor(1 + Math.random() * 4),
}))

const DEMO_CAMPAIGNS = [
  { name: 'Season Pass Promo', contacts: 412, opportunities: 98, revenue: '$48,200', conversion: '23.8%' },
  { name: 'Birthday Party Leads', contacts: 287, opportunities: 64, revenue: '$32,100', conversion: '22.3%' },
  { name: 'Group Sales Outreach', contacts: 198, opportunities: 52, revenue: '$28,400', conversion: '26.3%' },
  { name: 'Annual Pass Renewal', contacts: 156, opportunities: 78, revenue: '$22,100', conversion: '50.0%' },
  { name: 'Corporate Events', contacts: 124, opportunities: 31, revenue: '$18,600', conversion: '25.0%' },
  { name: 'Holiday Campaign', contacts: 107, opportunities: 19, revenue: '$12,400', conversion: '17.8%' },
]

export async function GoHighLevelReport({ clientSlug, dateRange }: GoHighLevelReportProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          CRM Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Go<span className="gradient-text-revenue">HighLevel</span>
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
        <h3 className="mb-4 text-lg font-bold text-white">
          Pipeline Activity
        </h3>
        <AreaChart
          data={DEMO_PIPELINE}
          xKey="date"
          yKeys={[
            { key: 'contacts', color: CHART_COLORS.primary, label: 'Contacts' },
            { key: 'opportunities', color: CHART_COLORS.googleAds, label: 'Opportunities' },
            { key: 'deals', color: CHART_COLORS.positive, label: 'Deals Won' },
          ]}
          height={320}
        />
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Campaign Breakdown
        </h3>
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-bg-surface">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Campaign</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Contacts</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Opportunities</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Revenue</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Conv Rate</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_CAMPAIGNS.map((row) => (
                <tr key={row.name} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-5 py-3 font-semibold text-white">{row.name}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.contacts}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.opportunities}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.revenue}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.conversion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect GoHighLevel to see real CRM metrics
      </p>
    </div>
  )
}
