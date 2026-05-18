import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { CHART_COLORS } from '@/lib/constants'

interface TicketSalesReportProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Total Tickets Sold', value: '24,871', delta: 14.2 },
  { title: 'Ticket Revenue', value: '1,247,350', delta: 18.6, prefix: '$' },
  { title: 'Avg Ticket Price', value: '50.13', delta: 3.8, prefix: '$' },
  { title: 'Online Sales', value: '18,653', delta: 22.4 },
  { title: 'Walk-Up Sales', value: '6,218', delta: -4.1 },
  { title: 'Season Passes', value: '2,340', delta: 31.2 },
  { title: 'Group Bookings', value: '412', delta: 8.7 },
  { title: 'Refund Rate', value: '2.1', delta: -0.8, suffix: '%' },
]

const DEMO_DAILY_SALES = Array.from({ length: 30 }, (_, i) => {
  const isWeekend = (i % 7 === 5) || (i % 7 === 6)
  return {
    date: `Day ${i + 1}`,
    online: Math.floor((isWeekend ? 800 : 450) + Math.random() * 300 + i * 8),
    walkUp: Math.floor((isWeekend ? 350 : 120) + Math.random() * 150),
    revenue: Math.floor((isWeekend ? 58000 : 28000) + Math.random() * 15000 + i * 400),
  }
})

const DEMO_PRODUCTS = [
  { name: 'General Admission (1-Day)', sold: 12,  revenue: '$414,960', avg: '$34.58', pct: '33.3%' },
  { name: 'All-Access Pass (1-Day)', sold: 6842, revenue: '$410,520', avg: '$59.99', pct: '27.5%' },
  { name: 'Season Pass — Gold', sold: 1560, revenue: '$202,800', avg: '$129.99', pct: '6.3%' },
  { name: 'Season Pass — Platinum', sold: 780, revenue: '$140,400', avg: '$179.99', pct: '3.1%' },
  { name: 'Group Package (10+)', sold: 2480, revenue: '$99,200', avg: '$40.00', pct: '10.0%' },
  { name: 'Birthday Party Package', sold: 624, revenue: '$93,600', avg: '$149.99', pct: '2.5%' },
  { name: 'Go-Kart Add-On', sold: 4320, revenue: '$43,200', avg: '$10.00', pct: '17.4%' },
]

export async function TicketSalesReport({ clientSlug, dateRange }: TicketSalesReportProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Theme Park Revenue
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Ticket <span className="gradient-text-revenue">Sales</span>
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
          Daily Ticket Sales
        </h3>
        <AreaChart
          data={DEMO_DAILY_SALES}
          xKey="date"
          yKeys={[
            { key: 'online', color: CHART_COLORS.primary, label: 'Online' },
            { key: 'walkUp', color: CHART_COLORS.email, label: 'Walk-Up' },
          ]}
          height={320}
        />
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">
          Revenue by Ticket Type
        </h3>
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] bg-bg-surface">
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-text-muted">Product</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Sold</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Revenue</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">Avg Price</th>
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-text-muted">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PRODUCTS.map((row) => (
                <tr key={row.name} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-5 py-3 font-semibold text-white">{row.name}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.sold.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.revenue}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.avg}</td>
                  <td className="px-5 py-3 text-right text-white/70">{row.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Demo data — connect ticketing system to see real sales metrics
      </p>
    </div>
  )
}
