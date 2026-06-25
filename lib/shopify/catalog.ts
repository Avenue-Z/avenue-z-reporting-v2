import type { MetricFormat } from '@/lib/dashboard/types'

/**
 * Curated, friendly Shopify (ShopifyQL) metrics for the dashboard block builder —
 * so non-technical users pick a named metric instead of writing ShopifyQL.
 * Each `query` is a ShopifyQL body WITHOUT a date clause (the adapter appends
 * SINCE/UNTIL from the block's range). All queries verified live against the
 * Kind Patches store (bright-patches) 2026-06.
 */
export interface ShopifyMetric {
  id: string
  label: string
  query: string
  format: MetricFormat
}

export const SHOPIFY_METRICS: ShopifyMetric[] = [
  { id: 'new-subscriptions', label: 'New Subscriptions', query: "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'", format: 'count' },
  { id: 'net-sales', label: 'Net Sales', query: 'FROM sales SHOW net_sales', format: 'currency' },
  { id: 'total-sales', label: 'Total Sales', query: 'FROM sales SHOW total_sales', format: 'currency' },
  { id: 'gross-sales', label: 'Gross Sales', query: 'FROM sales SHOW gross_sales', format: 'currency' },
  { id: 'orders', label: 'Orders', query: 'FROM sales SHOW orders', format: 'count' },
  { id: 'average-order-value', label: 'Average Order Value', query: 'FROM sales SHOW average_order_value', format: 'currency' },
  { id: 'customers', label: 'Customers', query: 'FROM sales SHOW customers', format: 'count' },
  { id: 'new-customers', label: 'New Customers', query: "FROM sales SHOW customers WHERE new_or_returning_customer = 'New'", format: 'count' },
  { id: 'returning-customers', label: 'Returning Customers', query: "FROM sales SHOW customers WHERE new_or_returning_customer = 'Returning'", format: 'count' },
  { id: 'returns', label: 'Returns', query: 'FROM sales SHOW returns', format: 'currency' },
  { id: 'discounts', label: 'Discounts', query: 'FROM sales SHOW discounts', format: 'currency' },
  { id: 'taxes', label: 'Taxes', query: 'FROM sales SHOW taxes', format: 'currency' },
]

/** Look up a catalog metric by its id or by an exact query match. */
export function findShopifyMetric(idOrQuery: string): ShopifyMetric | undefined {
  return SHOPIFY_METRICS.find((m) => m.id === idOrQuery || m.query === idOrQuery)
}

/** ShopifyQL `sales` table columns that are safe + low/medium cardinality to GROUP BY
 *  in a chart. Verified live against bright-patches 2026-06. */
export const SHOPIFY_DIMENSIONS: readonly { id: string; label: string }[] = [
  { id: 'sales_channel',             label: 'Sales Channel' },
  { id: 'product_type',              label: 'Product Type' },
  { id: 'product_title',             label: 'Product' },
  { id: 'billing_country',           label: 'Country' },
  { id: 'billing_region',            label: 'Region' },
  { id: 'new_or_returning_customer', label: 'New vs Returning' },
] as const

/** Safe-column guard for any ShopifyQL dimension before interpolation into a GROUP BY. */
export const SHOPIFY_DIM_RE = /^[a-z0-9_]+$/
