/**
 * TripleWhale live discovery — server-side only. Lists the queryable columns of
 * pixel_joined_tvf (numeric -> metrics, string -> dimensions) and a dimension's
 * distinct values, for the dashboard builder. Verified via DESCRIBE + SELECT DISTINCT.
 */
import { twSql } from './client'

export interface TwField { value: string; label: string }
export interface TwFields { metrics: TwField[]; dimensions: TwField[] }

/** pixel_joined_tvf with the standard args used across TW queries. */
export const PIXEL_TVF = `pixel_joined_tvf(
  subscription_filter      = NULL,
  include_custom_ad_spend  = true,
  sales_platform_filter    = NULL,
  use_click_date           = false
)`

const COLUMN_RE = /^[a-z0-9_]+$/

/** ClickHouse numeric types, after unwrapping Nullable(...). */
export function isNumericType(type: string): boolean {
  const inner = type.replace(/^Nullable\((.*)\)$/, '$1')
  return /^(?:U?Int(?:8|16|32|64|128|256)|Float(?:32|64)|Decimal)/i.test(inner)
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Split DESCRIBE rows into numeric metric columns and string dimension columns. */
export function parseColumns(describeRows: unknown): TwFields {
  const rows = Array.isArray(describeRows) ? (describeRows as { name?: unknown; type?: unknown }[]) : []
  const metrics: TwField[] = []
  const dimensions: TwField[] = []
  for (const r of rows) {
    if (typeof r.name !== 'string' || typeof r.type !== 'string') continue
    const field: TwField = { value: r.name, label: humanize(r.name) }
    if (isNumericType(r.type)) metrics.push(field)
    else if (/String/i.test(r.type)) dimensions.push(field)
  }
  return { metrics, dimensions }
}

type Range = { startDate: string; endDate: string }
type Opts = { fetchImpl?: typeof fetch }

// Matches buildMetricSql's BASE_WHERE so the populated-check sees the same data the
// real metric queries do.
const METRIC_WHERE = `event_date BETWEEN @startDate AND @endDate
  AND attribution_window = '7_days'
  AND model = 'Triple Attribution'`

/**
 * Drop numeric metrics that have NO data for this shop over `range`. pixel_joined_tvf
 * exposes 70+ numeric columns, but many (orders_quantity, gross_sales, custom_*,
 * subscription_*, …) are unpopulated per-shop and would render empty/zero charts — we
 * only want to OFFER metrics that pull real data. One aggregate query sums every
 * candidate; columns returning 0/null are dropped. Degrades to the full list on any
 * error (and never returns empty), so the builder's metric picker never breaks.
 */
export async function onlyPopulatedMetrics(
  apiKey: string,
  shopId: string,
  metrics: TwField[],
  range: Range,
  opts: Opts = {},
): Promise<TwField[]> {
  const probeable = metrics.filter((m) => COLUMN_RE.test(m.value))
  const unprobeable = metrics.filter((m) => !COLUMN_RE.test(m.value))
  if (probeable.length === 0) return metrics
  const sel = probeable.map((m, i) => `SUM(${m.value}) AS v${i}`).join(', ')
  const query = `SELECT ${sel}\nFROM ${PIXEL_TVF}\nWHERE ${METRIC_WHERE}`
  try {
    const rows = await twSql({ apiKey, shopId, query, startDate: range.startDate, endDate: range.endDate }, opts)
    const row = (rows[0] ?? {}) as Record<string, unknown>
    const kept = probeable.filter((_, i) => {
      const v = Number(row[`v${i}`])
      return Number.isFinite(v) && v !== 0
    })
    const result = [...kept, ...unprobeable]
    return result.length > 0 ? result : metrics // never offer an empty list
  } catch {
    return metrics // discovery must not break if the probe fails
  }
}

export async function twFields(apiKey: string, shopId: string, range: Range, opts: Opts = {}): Promise<TwFields> {
  const rows = await twSql({ apiKey, shopId, query: `DESCRIBE ${PIXEL_TVF}`, startDate: range.startDate, endDate: range.endDate }, opts)
  const all = parseColumns(rows)
  const metrics = await onlyPopulatedMetrics(apiKey, shopId, all.metrics, range, opts)
  return { metrics, dimensions: all.dimensions }
}

export async function twDistinctValues(apiKey: string, shopId: string, column: string, range: Range, opts: Opts = {}): Promise<string[]> {
  if (!COLUMN_RE.test(column)) throw new Error(`unsafe column: ${column}`)
  const query = `SELECT DISTINCT ${column} AS value
FROM ${PIXEL_TVF}
WHERE event_date BETWEEN @startDate AND @endDate AND ${column} IS NOT NULL
ORDER BY value
LIMIT 200`
  const rows = await twSql({ apiKey, shopId, query, startDate: range.startDate, endDate: range.endDate }, opts)
  return rows.map((r) => r.value).filter((v): v is string => typeof v === 'string' && v.length > 0)
}
