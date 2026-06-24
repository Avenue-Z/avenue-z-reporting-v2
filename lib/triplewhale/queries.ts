import { TwQueryError } from './client'

export type TwMetric =
  | 'ad_spend'
  | 'revenue'
  | 'blended_roas'
  | 'purchases'
  | 'cpa'
  | 'conv_rate'
  | 'sessions'
  | 'clicks'
  | 'impressions'

/** SELECT expression (aliased AS value) for each metric, over pixel_joined_tvf columns. */
export const TW_METRIC_SQL: Record<TwMetric, string> = {
  ad_spend: 'SUM(spend)',
  // Platform-reported conversion value. The pixel/Shopify revenue columns
  // (order_revenue, gross_sales, click/view_revenue) are not populated for some
  // shops in pixel_joined_tvf; channel_reported_conversion_value is the reliable
  // revenue source. Revisit if pixel revenue becomes available per-shop.
  revenue: 'SUM(channel_reported_conversion_value)',
  blended_roas: 'SUM(channel_reported_conversion_value) / NULLIF(SUM(spend), 0)',
  purchases: 'SUM(orders_quantity)',
  cpa: 'SUM(spend) / NULLIF(SUM(orders_quantity), 0)',
  conv_rate: 'SUM(orders_quantity) / NULLIF(SUM(sessions), 0) * 100',
  sessions: 'SUM(sessions)',
  clicks: 'SUM(clicks)',
  impressions: 'SUM(impressions)',
}

export function isTwMetric(s: string): s is TwMetric {
  return Object.prototype.hasOwnProperty.call(TW_METRIC_SQL, s)
}

export interface TwFilter { column: string; values: string[] }

const COLUMN_RE = /^[a-z0-9_]+$/
export function isSafeColumn(c: string): boolean {
  return COLUMN_RE.test(c)
}
export function escapeSqlValue(v: string): string {
  return v.replace(/'/g, "''")
}

/**
 * Single-row aggregate query for one metric, optionally filtered by dimensions.
 * `metric` is a curated alias (TW_METRIC_SQL) or a raw numeric column -> SUM(column).
 * `@startDate`/`@endDate` substitute server-side from `period`.
 */
export function buildMetricSql(metric: string, filters: TwFilter[] = []): string {
  const expr = TW_METRIC_SQL[metric as TwMetric] ?? (isSafeColumn(metric) ? `SUM(${metric})` : null)
  if (expr === null) throw new TwQueryError(`unsafe TripleWhale metric: ${metric}`)
  const filterSql = filters
    .map((f) => {
      if (!isSafeColumn(f.column)) throw new TwQueryError(`unsafe TripleWhale filter column: ${f.column}`)
      const vals = f.values.filter((v) => v !== '')
      if (vals.length === 0) return ''
      if (vals.length === 1) return `\n  AND ${f.column} = '${escapeSqlValue(vals[0])}'`
      return `\n  AND ${f.column} IN (${vals.map((v) => `'${escapeSqlValue(v)}'`).join(', ')})`
    })
    .join('')
  return `SELECT ${expr} AS value
FROM pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)
WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'${filterSql}`
}
