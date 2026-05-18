import { KpiCard } from '@/components/charts/kpi-card'
import { AreaChart } from '@/components/charts/area-chart'
import { DonutChart } from '@/components/charts/donut-chart'
import { DataTable } from '@/components/charts/data-table'
import { CHART_COLORS } from '@/lib/constants'

interface ShopifyPerformanceProps {
  clientSlug: string
  dateRange?: string
}

const DEMO_KPIS = [
  { title: 'Total Revenue', value: '124,580', prefix: '$', delta: 18.4 },
  { title: 'Orders', value: '1,847', delta: 15.2 },
  { title: 'AOV', value: '67.45', prefix: '$', delta: 2.8 },
  { title: 'Conversion Rate', value: '3.12', suffix: '%', delta: 8.7 },
  { title: 'Cart Abandonment', value: '68.4', suffix: '%', delta: -4.2 },
  { title: 'Returning Customers', value: '32.1', suffix: '%', delta: 6.9 },
  { title: 'Refund Rate', value: '2.8', suffix: '%', delta: -12.3 },
  { title: 'Net Revenue', value: '121,092', prefix: '$', delta: 19.1 },
]

const DEMO_REVENUE_TREND = Array.from({ length: 30 }, (_, i) => ({
  date: `Day ${i + 1}`,
  revenue: Math.floor(3200 + Math.random() * 2000 + i * 50),
  orders: Math.floor(45 + Math.random() * 25 + i * 2),
}))

const DEMO_TRAFFIC_SOURCES = [
  { name: 'Organic Search', value: 34, color: CHART_COLORS.ga4 },
  { name: 'Paid Social', value: 28, color: CHART_COLORS.metaAds },
  { name: 'Direct', value: 18, color: CHART_COLORS.primary },
  { name: 'Email', value: 12, color: CHART_COLORS.email },
  { name: 'Paid Search', value: 8, color: CHART_COLORS.googleAds },
]

const DEMO_TOP_PRODUCTS = [
  { product: 'Premium Widget — Blue', revenue: '$18,240', orders: '284', avgPrice: '$64.23', refunds: '6' },
  { product: 'Starter Kit Bundle', revenue: '$14,890', orders: '198', avgPrice: '$75.20', refunds: '4' },
  { product: 'Accessory Pack', revenue: '$12,450', orders: '312', avgPrice: '$39.90', refunds: '8' },
  { product: 'Pro Upgrade', revenue: '$11,200', orders: '112', avgPrice: '$100.00', refunds: '2' },
  { product: 'Gift Card — $50', revenue: '$9,800', orders: '196', avgPrice: '$50.00', refunds: '0' },
]

export async function ShopifyPerformanceReport({ clientSlug, dateRange }: ShopifyPerformanceProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          E-Commerce Performance
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Shopify{' '}
          <span className="gradient-text-revenue">Performance</span>
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
              { key: 'revenue', color: CHART_COLORS.shopify, label: 'Revenue ($)' },
              { key: 'orders', color: CHART_COLORS.positive, label: 'Orders' },
            ]}
            height={320}
          />
        </div>
        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Revenue by Traffic Source</h3>
          <DonutChart data={DEMO_TRAFFIC_SOURCES} height={320} />
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
            { key: 'refunds', label: 'Refunds', align: 'right' },
          ]}
          rows={DEMO_TOP_PRODUCTS}
        />
      </div>

      <p className="text-xs text-text-muted">Demo data — connect Shopify to see real metrics</p>
    </div>
  )
}
