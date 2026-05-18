/** A single row of GA4 data, keyed by dimension/metric name */
export interface GA4Row {
  [key: string]: string | number | null
}

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
}
