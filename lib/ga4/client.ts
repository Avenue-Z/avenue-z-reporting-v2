/**
 * GA4 Data API client — server-side only.
 *
 * Auth: Google Service Account stored as base64-encoded JSON in
 * the GOOGLE_SERVICE_ACCOUNT_KEY environment variable.
 *
 * Per-client GA4 property IDs are stored as env var names in clients.config.ts.
 * e.g. ga4PropertyId: 'GA4_PROPERTY_ID_AVENUE_Z'
 * and the env var GA4_PROPERTY_ID_AVENUE_Z = 'properties/123456789'
 *
 * Run: npm install @google-analytics/data
 */
import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { getClientBySlug } from '@/lib/clients.config'
import type { GA4QueryParams, GA4ReportResult, GA4Row } from './types'

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

function _startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday-based
  const r = new Date(d)
  r.setDate(d.getDate() + diff)
  r.setHours(0, 0, 0, 0)
  return r
}

function _endOfWeek(d: Date): Date {
  const s = _startOfWeek(d)
  const e = new Date(s)
  e.setDate(s.getDate() + 6)
  return e
}

function _startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function _endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function _startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3, 1)
}

function _endOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3)
  return new Date(d.getFullYear(), q * 3 + 3, 0)
}

/**
 * Resolve any date range preset or custom string to ISO date strings.
 * Always returns { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }.
 */
export function parseDateRange(dateRange: string): { startDate: string; endDate: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (dateRange.startsWith('custom:')) {
    const [s, e] = dateRange.replace('custom:', '').split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  if (dateRange.includes(',')) {
    const [s, e] = dateRange.split(',')
    return { startDate: s.trim(), endDate: e.trim() }
  }

  const match = dateRange.match(/last_(\d+)_days/)
  if (match) {
    const days = parseInt(match[1])
    const start = new Date(today)
    start.setDate(today.getDate() - days)
    return { startDate: toISO(start), endDate: toISO(today) }
  }

  switch (dateRange) {
    case 'this_week':
      return { startDate: toISO(_startOfWeek(today)), endDate: toISO(today) }
    case 'last_week': {
      const prev = new Date(today); prev.setDate(today.getDate() - 7)
      return { startDate: toISO(_startOfWeek(prev)), endDate: toISO(_endOfWeek(prev)) }
    }
    case 'this_month':
      return { startDate: toISO(_startOfMonth(today)), endDate: toISO(today) }
    case 'last_month': {
      const lastM = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      return { startDate: toISO(_startOfMonth(lastM)), endDate: toISO(_endOfMonth(lastM)) }
    }
    case 'this_quarter':
      return { startDate: toISO(_startOfQuarter(today)), endDate: toISO(today) }
    case 'last_quarter': {
      const lq = new Date(today); lq.setMonth(today.getMonth() - 3)
      return { startDate: toISO(_startOfQuarter(lq)), endDate: toISO(_endOfQuarter(lq)) }
    }
    case 'this_year':
    case 'year_to_date':
      return { startDate: `${today.getFullYear()}-01-01`, endDate: toISO(today) }
    case 'last_year': {
      const ly = today.getFullYear() - 1
      return { startDate: `${ly}-01-01`, endDate: `${ly}-12-31` }
    }
    default: {
      const start = new Date(today); start.setDate(today.getDate() - 30)
      return { startDate: toISO(start), endDate: toISO(today) }
    }
  }
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
export async function ga4Query(params: GA4QueryParams): Promise<GA4ReportResult> {
  const config = getClientBySlug(params.clientSlug)
  if (!config) throw new Error(`Unknown client: ${params.clientSlug}`)

  if (!config.ga4PropertyId) {
    throw new Error(`GA4 not configured for client: ${params.clientSlug}`)
  }

  const rawPropertyId = process.env[config.ga4PropertyId]
  if (!rawPropertyId) {
    throw new Error(
      `Missing env var: ${config.ga4PropertyId}. ` +
      'Set it to your GA4 property ID, e.g. "properties/123456789".'
    )
  }

  const propertyId = rawPropertyId.startsWith('properties/')
    ? rawPropertyId
    : `properties/${rawPropertyId}`

  const { startDate, endDate } = parseDateRange(params.dateRange)

  const client = getClient()
  const [response] = await client.runReport({
    property: propertyId,
    dateRanges: [{ startDate, endDate }],
    metrics: params.metrics.map((name) => ({ name })),
    dimensions: (params.dimensions ?? []).map((name) => ({ name })),
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
