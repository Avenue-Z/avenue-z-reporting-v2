import type { protos } from '@google-analytics/data'

/** A single row of GA4 data, keyed by dimension/metric name */
export interface GA4Row {
  [key: string]: string | number | null
}

/** GA4 Data API dimension filter expression (passed straight to runReport). */
export type GA4DimensionFilter =
  protos.google.analytics.data.v1beta.IRunReportRequest['dimensionFilter']

/** GA4 Data API order-by expression (passed straight to runReport). */
export type GA4OrderBy = protos.google.analytics.data.v1beta.IOrderBy

/** Parsed GA4 response from runReport */
export interface GA4ReportResult {
  rows: GA4Row[]
  rowCount: number
  metadata: {
    startDate: string
    endDate: string
    metrics: string[]
    dimensions: string[]
  }
}

export interface GA4QueryParams {
  clientSlug: string
  metrics: string[]
  dimensions?: string[]
  /**
   * Either a Supermetrics-style string ("last_30_days", "last_7_days")
   * or an ISO range ("2025-01-01,2025-01-31")
   */
  dateRange: string
  limit?: number
  /** Optional GA4 dimension filter, e.g. an inListFilter on pagePath. */
  dimensionFilter?: GA4DimensionFilter
  /**
   * Optional GA4 sort order, e.g. sessions descending. Passed through to
   * runReport only when provided. Every existing caller that omits it keeps
   * GA4's default unspecified row order unchanged. A caller combining this
   * with `limit` gets an actual "top N" instead of "whichever N rows GA4
   * happened to return".
   */
  orderBys?: GA4OrderBy[]
}
