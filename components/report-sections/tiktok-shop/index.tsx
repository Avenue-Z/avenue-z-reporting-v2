import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DonutChart } from '@/components/charts/donut-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface TikTokShopProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Total Revenue', value: '87,340', prefix: '$', delta: 34.2 },
  { title: 'Orders', value: '2,418', delta: 28.6 },
  { title: 'AOV', value: '36.12', prefix: '$', delta: 4.3 },
  { title: 'Conversion Rate', value: '4.87', suffix: '%', delta: 12.1 },
  { title: 'Shop Views', value: '148,920', delta: 41.3 },
  { title: 'Add to Cart Rate', value: '8.2', suffix: '%', delta: 6.4 },
  { title: 'Refund Rate', value: '3.4', suffix: '%', delta: -8.7 },
  { title: 'Affiliate Revenue', value: '22,180', prefix: '$', delta: 52.1 },
]

const DEMO_REVENUE_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  revenue: Math.floor(1800 + Math.random() * 1500 + i * 80),
  orders: Math.floor(50 + Math.random() * 40 + i * 3),
}))

const DEMO_REVENUE_SOURCES = [
  { name: 'Organic Shop', value: 38, color: CHART_COLORS.tiktok },
  { name: 'Affiliate', value: 26, color: CHART_COLORS.positive },
  { name: 'Live Shopping', value: 20, color: CHART_COLORS.primary },
  { name: 'Paid (Shop Ads)', value: 12, color: CHART_COLORS.metaAds },
  { name: 'Flash Sale', value: 4, color: CHART_COLORS.email },
]

const DEMO_TOP_PRODUCTS = [
  { product: 'Kindness Patch — Variety Pack (10)', revenue: '$14,280', orders: '476', avgPrice: '$29.99', rating: '4.9' },
  { product: 'Positivity Patch — Gold Collection', revenue: '$11,640', orders: '388', avgPrice: '$29.99', rating: '4.8' },
  { product: 'Motivational Patch — Daily Set (5)', revenue: '$9,870', orders: '658', avgPrice: '$14.99', rating: '4.9' },
  { product: 'Custom Patch Bundle — Build Your Own', revenue: '$8,920', orders: '223', avgPrice: '$39.99', rating: '4.7' },
  { product: 'Kids Kindness Kit', revenue: '$7,450', orders: '372', avgPrice: '$19.99', rating: '4.9' },
  { product: 'Teacher Appreciation Pack (20)', revenue: '$6,840', orders: '171', avgPrice: '$39.99', rating: '5.0' },
]

const DEMO_TOP_CREATORS = [
  { creator: '@kindnessdaily', followers: '1.2M', orders: '312', revenue: '$8,420', commission: '$1,684' },
  { creator: '@teachertok_life', followers: '845K', orders: '248', revenue: '$6,180', commission: '$1,236' },
  { creator: '@momof3chaos', followers: '2.1M', orders: '186', revenue: '$4,920', commission: '$984' },
  { creator: '@patchqueen2026', followers: '420K', orders: '142', revenue: '$3,840', commission: '$768' },
  { creator: '@positivevibes.co', followers: '680K', orders: '98', revenue: '$2,820', commission: '$564' },
]

export async function TikTokShopReport({ clientSlug, dateRange }: TikTokShopProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Social Commerce
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          TikTok Shop{' '}
          <span className="gradient-text-reputation">Performance</span>
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
          <h3 className="mb-4 text-lg font-bold text-white">Revenue &amp; Orders Trend</h3>
          <AreaChart
            data={DEMO_REVENUE_TREND}
            xKey="date"
            yKeys={[
              { key: 'revenue', color: CHART_COLORS.tiktok, label: 'Revenue ($)' },
              { key: 'orders', color: CHART_COLORS.positive, label: 'Orders' },
            ]}
            height={320}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Revenue by Source</h3>
          <DonutChart data={DEMO_REVENUE_SOURCES} height={320} />
        </div>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Top Products</h3>
        <DataTable
          columns={[
            { key: 'product', label: 'Product' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'orders', label: 'Orders', align: 'right' },
            { key: 'avgPrice', label: 'Avg Price', align: 'right' },
            { key: 'rating', label: 'Rating', align: 'right' },
          ]}
          rows={DEMO_TOP_PRODUCTS}
        />
      </div>

      <div>
        <h3 className="mb-4 text-lg font-bold text-white">Top Affiliate Creators</h3>
        <DataTable
          columns={[
            { key: 'creator', label: 'Creator' },
            { key: 'followers', label: 'Followers', align: 'right' },
            { key: 'orders', label: 'Orders', align: 'right' },
            { key: 'revenue', label: 'Revenue', align: 'right' },
            { key: 'commission', label: 'Commission', align: 'right' },
          ]}
          rows={DEMO_TOP_CREATORS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect TikTok Shop to see real metrics</p>
    </div>
  )
}
