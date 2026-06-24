/**
 * GA4 Data API client — server-side only.
 *
 * Auth: Google Service Account stored as base64-encoded JSON in
 * the GOOGLE_SERVICE_ACCOUNT_KEY environment variable.
 *
 * Per-client GA4 property IDs are stored directly in the database.
 * e.g. ga4PropertyId: 'properties/123456789'
 *
 * Run: npm install @google-analytics/data
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { getClientBySlug } from '@/lib/db/queries'
import type { GA4QueryParams, GA4ReportResult, GA4Row } from './types'
import { cached } from '@/lib/cache'
import { resolveDateRange } from '@/lib/date-range'

let _client: BetaAnalyticsDataClient | null = null

function getClient(): BetaAnalyticsDataClient {
  if (!_client) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) {
      throw new Error(
        'Missing GOOGLE_SERVICE_ACCOUNT_KEY env var. ' +
        'Set it to a base64-encoded service account JSON key.'
      )
    }
    const credentials = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf-8')
    )
    _client = new BetaAnalyticsDataClient({ credentials })
  }
  return _client
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Resolve any date range preset or custom string to ISO date strings.
 * Delegates to lib/date-range (client-safe, single source of truth).
 * Always returns { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }.
 */
export function parseDateRange(dateRange: string): { startDate: string; endDate: string } {
  return resolveDateRange(dateRange)
}

/**
 * Derive the comparison date range from the main range + compare mode.
 * Returns ISO date strings, or null if no comparison.
 */
export function deriveCompareRange(
  mainRange: string,
  compareMode: string | null | undefined
): { startDate: string; endDate: string } | null {
  if (!compareMode) return null
  const main = parseDateRange(mainRange)

  if (compareMode === 'previous_year') {
    const s = new Date(main.startDate); s.setFullYear(s.getFullYear() - 1)
    const e = new Date(main.endDate);   e.setFullYear(e.getFullYear() - 1)
    return { startDate: toISO(s), endDate: toISO(e) }
  }

  if (compareMode === 'previous_period') {
    const s = new Date(main.startDate)
    const e = new Date(main.endDate)
    const days = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1
    const prevEnd = new Date(s); prevEnd.setDate(prevEnd.getDate() - 1)
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1))
    return { startDate: toISO(prevStart), endDate: toISO(prevEnd) }
  }

  if (compareMode.startsWith('custom:')) {
    return parseDateRange(compareMode)
  }

  return null
}

/**
 * Run a GA4 Data API report for a given client.
 * Server-side only — never call from a Client Component.
 */
async function ga4QueryImpl(params: GA4QueryParams): Promise<GA4ReportResult> {
  const config = await getClientBySlug(params.clientSlug)
  if (!config) throw new Error(`Unknown client: ${params.clientSlug}`)

  if (!config.ga4PropertyId) {
    throw new Error(`GA4 not configured for client: ${params.clientSlug}`)
  }

  const propertyId = config.ga4PropertyId.startsWith('properties/')
    ? config.ga4PropertyId
    : `properties/${config.ga4PropertyId}`

  const { startDate, endDate } = parseDateRange(params.dateRange)

  const client = getClient()
  const [response] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate, endDate }],
    metrics: params.metrics.map((name) => ({ name })),
    dimensions: (params.dimensions ?? []).map((name) => ({ name })),
    ...(params.dimensionFilter ? { dimensionFilter: params.dimensionFilter } : {}),
    limit: params.limit ?? 1000,
  })

  const rows: GA4Row[] = (response.rows ?? []).map((row) => {
    const out: GA4Row = {}
    ;(row.dimensionValues ?? []).forEach((dv, i) => {
      const name = response.dimensionHeaders?.[i]?.name ?? `dimension_${i}`
      out[name] = dv.value ?? null
    })
    ;(row.metricValues ?? []).forEach((mv, i) => {
      const name = response.metricHeaders?.[i]?.name ?? `metric_${i}`
      out[name] = mv.value !== undefined ? Number(mv.value) : null
    })
    return out
  })

  return {
    rows,
    rowCount: response.rowCount ?? rows.length,
    metadata: {
      startDate,
      endDate,
      metrics: params.metrics,
      dimensions: params.dimensions ?? [],
    },
  }
}

/**
 * Convenience: fetch a single set of totals (no dimensions) for a date range.
 * Returns the first (and only) row of metric values.
 */
export async function ga4Totals(
  clientSlug: string,
  metrics: string[],
  dateRange: string
): Promise<GA4Row> {
  const result = await ga4Query({ clientSlug, metrics, dateRange })
  return result.rows[0] ?? {}
}

export const ga4Query = cached(
  'ga4',
  'runReport',
  ga4QueryImpl,
  {
    extractTags: ([params]) => ({ client: params.clientSlug, dateRange: params.dateRange }),
  },
)
