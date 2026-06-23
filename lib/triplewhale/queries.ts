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

/**
 * Single-row aggregate query (blended across channels) for one metric.
 * `@startDate`/`@endDate` are substituted server-side from `period`.
 * pixel_joined_tvf args + attribution settings are pptx defaults — validate
 * per-shop in TW's SQL Builder if numbers look off.
 */
export function buildMetricSql(metric: TwMetric): string {
  return `SELECT ${TW_METRIC_SQL[metric]} AS value
FROM pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)
WHERE event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'`
}
