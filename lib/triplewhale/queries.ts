import { TwQueryError } from './client'
import type { Granularity } from '@/lib/dashboard/types'

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
  // Conversion COUNT, parallel to channel_reported_conversion_value (revenue):
  // the pixel order columns (orders_quantity, click/view_orders, website_purchases)
  // are not populated for some shops in pixel_joined_tvf, so they returned 0 here.
  // channel_reported_conversions is the reliable, attribution-consistent count.
  purchases: 'SUM(channel_reported_conversions)',
  cpa: 'SUM(spend) / NULLIF(SUM(channel_reported_conversions), 0)',
  conv_rate: 'SUM(channel_reported_conversions) / NULLIF(SUM(sessions), 0) * 100',
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

const PIXEL_TVF = `pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)`
const BASE_WHERE = `event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'`

export interface BuildOptions {
  /** Single-column GROUP BY for grouped mode. v1 enforces single column. */
  groupBy?: string
  /** DATE_TRUNC bucket for series mode. */
  bucket?: Granularity
}

/**
 * Single-row aggregate query for one metric (scalar mode), OR a multi-row
 * grouped/series query when opts is provided. Filters are AND-combined in all
 * modes. `@startDate`/`@endDate` substitute server-side from `period`.
 */
export function buildMetricSql(
  metric: string,
  filters: TwFilter[] = [],
  opts: BuildOptions = {},
): string {
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

  // Grouped mode: SELECT dim, value FROM ... GROUP BY dim ORDER BY value DESC.
  if (opts.groupBy) {
    if (!isSafeColumn(opts.groupBy)) throw new TwQueryError(`unsafe TripleWhale dimension: ${opts.groupBy}`)
    return `SELECT ${opts.groupBy} AS dim, ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}
GROUP BY ${opts.groupBy}
ORDER BY value DESC`
  }

  // Series mode: SELECT DATE_TRUNC(bucket, event_date), value FROM ... GROUP BY bucket ORDER BY bucket ASC.
  if (opts.bucket) {
    return `SELECT DATE_TRUNC('${opts.bucket}', event_date) AS bucket, ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}
GROUP BY bucket
ORDER BY bucket ASC`
  }

  // Scalar mode (existing behavior).
  return `SELECT ${expr} AS value
FROM ${PIXEL_TVF}
WHERE ${BASE_WHERE}${filterSql}`
}
