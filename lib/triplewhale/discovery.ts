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

export async function twFields(apiKey: string, shopId: string, range: Range, opts: Opts = {}): Promise<TwFields> {
  const rows = await twSql({ apiKey, shopId, query: `DESCRIBE ${PIXEL_TVF}`, startDate: range.startDate, endDate: range.endDate }, opts)
  return parseColumns(rows)
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
