// lib/dashboard/adapters/supermetrics.ts
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
import { smQuery, parseSmRows } from '@/lib/supermetrics/client'
import { SM_TIME_DIMENSION } from '@/lib/supermetrics/constants'
import { normalizeSmBucket } from '@/lib/supermetrics/buckets'
import type { Granularity, GroupedRow, LeafValue, SeriesPoint, SupermetricsBinding } from '../types'
import { DisconnectedError, InvalidMetricError, NoDataError } from '../errors'
import { joinGrouped, alignSeries } from '../group-join'

// Key part derived from the API key — never put the raw key in a cache key.
const keyHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

const SM_COLUMN_RE = /^[A-Za-z0-9_]+$/

/** Build the Supermetrics `filter` string from structured filters. Each row is
 *  one column matching ANY of its values (OR); rows are AND-combined. Values are
 *  unquoted (confirmed grammar). Unsafe columns and empty values are dropped. */
export function buildSmFilter(filters?: { column: string; values: string[] }[]): string | undefined {
  if (!filters || filters.length === 0) return undefined
  const parts: string[] = []
  for (const f of filters) {
    if (!SM_COLUMN_RE.test(f.column)) continue
    const vals = f.values.filter((v) => v !== '')
    if (vals.length === 0) continue
    parts.push(
      vals.length === 1
        ? `${f.column} == ${vals[0]}`
        : `(${vals.map((v) => `${f.column} == ${v}`).join(' OR ')})`,
    )
  }
  return parts.length ? parts.join(' AND ') : undefined
}

/** Sum a numeric metric field across rows; blank/missing cells count as 0. */
export function sumMetric(rows: Record<string, string>[], field: string): number {
  return rows.reduce((s, r) => s + Number(r[field] || 0), 0)
}

/** Accounts present in `returned` but not allowed by `expected`. Empty when no expectation. */
export function accountDrift(returned: string[], expected?: string[]): string[] {
  if (!expected) return []
  const allowed = new Set(expected)
  return returned.filter((a) => !allowed.has(a))
}

/** Per-client key var wins; otherwise fall back to the global SUPERMETRICS_API_KEY. */
export function resolveSmApiKey(
  smApiKeyEnvVar: string | null | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const perClient = smApiKeyEnvVar ? env[smApiKeyEnvVar] : undefined
  return perClient ?? env.SUPERMETRICS_API_KEY
}

/** Stable cross-render cache-key parts for one SM metric query (raw key hashed). */
export function smDataKey(
  apiKey: string, dsId: string, account: string, metricField: string, isoRange: string, filter: string,
): string[] {
  return ['sm-data', dsId, account, metricField, isoRange, filter, keyHash(apiKey)]
}

// Request-scoped dedupe (react cache) around cross-request persistence (unstable_cache),
// both keyed by the same primitive query identity. Two callers in one render (e.g. a
// formula's ref-pull and the referenced block's own island) share ONE in-flight fetch.
const cachedSum = cache(
  (apiKey: string, dsId: string, account: string, metricField: string, isoRange: string, filter: string): Promise<number> =>
    unstable_cache(
      async () => {
        const result = await smQuery({
          apiKey, dsId, dsAccounts: account, fields: [metricField], dateRange: isoRange,
          filters: filter || undefined,
        })
        const rows = parseSmRows(result)
        if (rows.length === 0) throw new NoDataError(`no rows for ${metricField} in ${isoRange}`)
        return sumMetric(rows, result.header[0] ?? metricField)
      },
      smDataKey(apiKey, dsId, account, metricField, isoRange, filter),
      { revalidate: 3600 },
    )(),
)

async function sumForRange(
  apiKey: string,
  b: SupermetricsBinding,
  isoRange: string, // "YYYY-MM-DD,YYYY-MM-DD"
): Promise<number> {
  return cachedSum(apiKey, b.dsId, b.account, b.metricField, isoRange, buildSmFilter(b.filters) ?? '')
}

export async function resolveSupermetricsLeaf(
  b: SupermetricsBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  // Lazy imports — these transitively load lib/db/client (throws at import without
  // DATABASE_URL). Dynamic-importing here keeps the module env-free to import,
  // mirroring lib/paid-search/kpis.ts.
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  // Current and compare ranges are independent SM queries — run them concurrently.
  const [value, prevValue] = await Promise.all([
    sumForRange(apiKey, b, `${startDate},${endDate}`),
    compareIso ? sumForRange(apiKey, b, compareIso) : Promise.resolve(undefined),
  ])

  return { value, prevValue }
}

// ─────────────────────────────────────────────────────────────────────────
// Grouped + series adapters
// ─────────────────────────────────────────────────────────────────────────

/** Flatten SM rows into { dim, value } shape. Numeric coercion: blank → 0. */
export function groupRowsFromSm(
  rows: Record<string, string>[],
  dim: string,
  metricField: string,
): { dim: string; value: number }[] {
  return rows.map((r) => ({ dim: r[dim], value: Number(r[metricField] || 0) }))
}

/** Flatten SM rows into { bucket, value } shape; bucket normalized via normalizeSmBucket;
 *  rows sorted ascending. */
export function seriesPointsFromSm(
  rows: Record<string, string>[],
  timeDim: string,
  metricField: string,
  granularity: Granularity,
): { bucket: string; value: number }[] {
  return rows
    .map((r) => ({ bucket: normalizeSmBucket(r[timeDim], granularity), value: Number(r[metricField] || 0) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Cache key for sm-grouped. Components match design §9. */
export function buildSmGroupedKey(
  b: SupermetricsBinding,
  dim: string,
  isoRange: string,
  apiKey: string,
): string[] {
  return ['sm-grouped', b.dsId, b.account, b.metricField, dim, isoRange, buildSmFilter(b.filters) ?? '', keyHash(apiKey)]
}

/** Cache key for sm-series. Components match design §9. */
export function buildSmSeriesKey(
  b: SupermetricsBinding,
  granularity: Granularity,
  isoRange: string,
  apiKey: string,
): string[] {
  return ['sm-series', b.dsId, b.account, b.metricField, granularity, isoRange, buildSmFilter(b.filters) ?? '', keyHash(apiKey)]
}

async function fetchGroupedForRange(
  apiKey: string,
  b: SupermetricsBinding,
  dim: string,
  isoRange: string,
): Promise<{ dim: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [dim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      const rows = parseSmRows(result, [dim, b.metricField])
      if (rows.length === 0) throw new NoDataError(`no rows for ${b.metricField} grouped by ${dim} in ${isoRange}`)
      return groupRowsFromSm(rows, dim, b.metricField)
    },
    buildSmGroupedKey(b, dim, isoRange, apiKey),
    { revalidate: 3600 },
  )()
}

export async function resolveSupermetricsGrouped(
  b: SupermetricsBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveSupermetricsGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]
  if (!SM_COLUMN_RE.test(dim)) throw new InvalidMetricError(`unsafe SM dimension: ${dim}`)

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchGroupedForRange(apiKey, b, dim, `${startDate},${endDate}`),
    compareIso ? fetchGroupedForRange(apiKey, b, dim, compareIso) : Promise.resolve(null),
  ])

  return joinGrouped(current, prior, dim)
}

async function fetchSeriesForRange(
  apiKey: string,
  b: SupermetricsBinding,
  timeDim: string,
  granularity: Granularity,
  isoRange: string,
): Promise<{ bucket: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const result = await smQuery({
        apiKey, dsId: b.dsId, dsAccounts: b.account,
        fields: [timeDim, b.metricField],
        dateRange: isoRange,
        filters: buildSmFilter(b.filters),
      })
      const rows = parseSmRows(result, [timeDim, b.metricField])
      if (rows.length === 0) throw new NoDataError(`no series rows for ${b.metricField} in ${isoRange}`)
      return seriesPointsFromSm(rows, timeDim, b.metricField, granularity)
    },
    buildSmSeriesKey(b, granularity, isoRange, apiKey),
    { revalidate: 3600 },
  )()
}

export async function resolveSupermetricsSeries(
  b: SupermetricsBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const dimMap = SM_TIME_DIMENSION[b.dsId as keyof typeof SM_TIME_DIMENSION]
  if (!dimMap) throw new InvalidMetricError(`no time dimension map for SM ds ${b.dsId}`)
  const timeDim = dimMap[granularity]

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchSeriesForRange(apiKey, b, timeDim, granularity, `${startDate},${endDate}`),
    compareIso ? fetchSeriesForRange(apiKey, b, timeDim, granularity, compareIso) : Promise.resolve(null),
  ])

  return alignSeries(current, prior)
}
