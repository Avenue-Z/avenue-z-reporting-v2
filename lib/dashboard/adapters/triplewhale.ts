// lib/dashboard/adapters/triplewhale.ts
import { unstable_cache } from 'next/cache'
import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
import { buildMetricSql } from '@/lib/triplewhale/queries'
import type { Granularity, GroupedRow, LeafValue, SeriesPoint, TripleWhaleBinding } from '../types'
import { DisconnectedError, InvalidMetricError, NoDataError } from '../errors'
import { joinGrouped, alignSeries } from '../group-join'

/** Number-coerce TW value cells. Blank/null/undefined → 0. */
function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Flatten TW SQL rows into { dim, value } shape. */
export function groupRowsFromTw(rows: { dim: unknown; value: unknown }[]): { dim: string; value: number }[] {
  return rows.map((r) => ({ dim: String(r.dim), value: toNumber(r.value) }))
}

/** Flatten TW SQL rows into { bucket, value } shape; bucket trimmed to date,
 *  rows sorted ascending. */
export function seriesPointsFromTw(rows: { bucket: unknown; value: unknown }[]): { bucket: string; value: number }[] {
  return rows
    .map((r) => ({ bucket: String(r.bucket).slice(0, 10), value: toNumber(r.value) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

/** Serialize TW filters into a stable cache-key string (matches the WHERE clause shape). */
function twFilterKey(b: TripleWhaleBinding): string {
  if (!b.filters || b.filters.length === 0) return ''
  return b.filters
    .map((f) => {
      const vals = (f.values ?? []).filter((v) => v !== '')
      if (vals.length === 0) return ''
      if (vals.length === 1) return `${f.column} = '${vals[0]}'`
      return `${f.column} IN (${vals.map((v) => `'${v}'`).join(', ')})`
    })
    .filter((s) => s !== '')
    .join(' AND ')
}

export function buildTwGroupedKey(b: TripleWhaleBinding, dim: string, isoRange: string): string[] {
  return ['tw-grouped', b.metric, dim, isoRange, twFilterKey(b)]
}

export function buildTwSeriesKey(b: TripleWhaleBinding, granularity: Granularity, isoRange: string): string[] {
  return ['tw-series', b.metric, granularity, isoRange, twFilterKey(b)]
}

/**
 * Resolve one TripleWhale metric for a client over a date range via the SQL API.
 * DB/date helpers are dynamically imported (they transitively load lib/db/client,
 * which throws at import without DATABASE_URL) — keeps this module env-free to import.
 */
export async function resolveTripleWhaleLeaf(
  b: TripleWhaleBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const query = buildMetricSql(b.metric, b.filters)
  const fetchValue = async (isoRange: string): Promise<number> => {
    const [startDate, endDate] = isoRange.split(',')
    const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
    const v = twValue(rows)
    if (v === null) throw new NoDataError(`no TripleWhale data for ${b.metric} in ${isoRange}`)
    return v
  }

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}

// ─────────────────────────────────────────────────────────────────────────
// Grouped + series adapters
// ─────────────────────────────────────────────────────────────────────────

async function fetchTwGroupedForRange(
  apiKey: string,
  shopId: string,
  b: TripleWhaleBinding,
  dim: string,
  isoRange: string,
): Promise<{ dim: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      const query = buildMetricSql(b.metric, b.filters, { groupBy: dim })
      const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
      if (rows.length === 0) throw new NoDataError(`no TW grouped rows for ${b.metric} by ${dim} in ${isoRange}`)
      return groupRowsFromTw(rows as { dim: unknown; value: unknown }[])
    },
    buildTwGroupedKey(b, dim, isoRange),
    { revalidate: 3600 },
  )()
}

export async function resolveTripleWhaleGrouped(
  b: TripleWhaleBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveTripleWhaleGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchTwGroupedForRange(apiKey, shopId, b, dim, `${startDate},${endDate}`),
    compareIso ? fetchTwGroupedForRange(apiKey, shopId, b, dim, compareIso) : Promise.resolve(null),
  ])

  return joinGrouped(current, prior, dim)
}

async function fetchTwSeriesForRange(
  apiKey: string,
  shopId: string,
  b: TripleWhaleBinding,
  granularity: Granularity,
  isoRange: string,
): Promise<{ bucket: string; value: number }[]> {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      const query = buildMetricSql(b.metric, b.filters, { bucket: granularity })
      const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
      if (rows.length === 0) throw new NoDataError(`no TW series rows for ${b.metric} in ${isoRange}`)
      return seriesPointsFromTw(rows as { bucket: unknown; value: unknown }[])
    },
    buildTwSeriesKey(b, granularity, isoRange),
    { revalidate: 3600 },
  )()
}

export async function resolveTripleWhaleSeries(
  b: TripleWhaleBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [current, prior] = await Promise.all([
    fetchTwSeriesForRange(apiKey, shopId, b, granularity, `${startDate},${endDate}`),
    compareIso ? fetchTwSeriesForRange(apiKey, shopId, b, granularity, compareIso) : Promise.resolve(null),
  ])

  return alignSeries(current, prior)
}
