import { cache } from 'react'
import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import { runShopifyQl, runShopifyQlTable, type TableData } from '@/lib/shopify/client'
import { SHOPIFY_DIM_RE } from '@/lib/shopify/catalog'
import type { Granularity, GroupedRow, LeafValue, SeriesPoint, ShopifyBinding } from '../types'
import { DisconnectedError, InvalidMetricError } from '../errors'
import { joinGrouped, alignSeries } from '../group-join'

const keyHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

// Request-scoped dedupe (react cache) around cross-request persistence (unstable_cache),
// keyed by the query identity. Mirrors the Supermetrics leaf (cachedSum): a formula's
// ref-pull and the referenced block's own island share ONE in-flight Shopify fetch, so a
// dashboard render hits the rate-limited Admin API a handful of times, not dozens.
const cachedShopifyValue = cache(
  (shop: string, token: string, query: string, isoRange: string): Promise<number> =>
    unstable_cache(
      async () => {
        const [startDate, endDate] = isoRange.split(',')
        return runShopifyQl({ shop, token, query, startDate, endDate })
      },
      ['shopify-data', shop, keyHash(query), isoRange],
      { revalidate: 3600 },
    )(),
)

/**
 * Per-client Shopify credentials by env-var convention:
 *   SHOPIFY_SHOP_<SLUG>          e.g. SHOPIFY_SHOP_KIND_PATCHES = bright-patches.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN_<SLUG>   the offline Admin API token (shpca_/shpat_)
 * where <SLUG> is the client slug uppercased with '-' → '_'.
 */
export function resolveShopifyCreds(
  slug: string,
  env: Record<string, string | undefined>,
): { shop: string; token: string } | null {
  const suffix = slug.toUpperCase().replace(/-/g, '_')
  const shop = env[`SHOPIFY_SHOP_${suffix}`]
  const token = env[`SHOPIFY_ADMIN_TOKEN_${suffix}`]
  return shop && token ? { shop, token } : null
}

/**
 * Resolve one ShopifyQL metric for a client over a date range via the Admin API.
 * DB/date helpers are dynamically imported (they transitively load lib/db/client,
 * which throws at import without DATABASE_URL) — keeps this module env-free to import.
 */
export async function resolveShopifyLeaf(
  b: ShopifyBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  const creds = resolveShopifyCreds(ctx.slug, process.env)
  if (!creds) throw new DisconnectedError(`Shopify not connected for ${ctx.slug}`)

  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const fetchValue = (isoRange: string): Promise<number> =>
    cachedShopifyValue(creds.shop, creds.token, b.query, isoRange)

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Flatten a 2-column ShopifyQL table (dim, metric) → { dim, value }. */
export function groupRowsFromShopify(td: TableData): { dim: string; value: number }[] {
  const dimKey = td.columns[0]?.name
  const valKey = td.columns[1]?.name
  if (typeof dimKey !== 'string' || typeof valKey !== 'string') return []
  return td.rows.map((r) => ({ dim: String(r[dimKey] ?? ''), value: toNumber(r[valKey]) }))
}

/** Flatten a 2-column ShopifyQL table (bucket, metric) → { bucket, value }, date-asc. */
export function seriesPointsFromShopify(td: TableData): { bucket: string; value: number }[] {
  const bKey = td.columns[0]?.name
  const valKey = td.columns[1]?.name
  if (typeof bKey !== 'string' || typeof valKey !== 'string') return []
  return td.rows
    .map((r) => ({ bucket: String(r[bKey] ?? '').slice(0, 10), value: toNumber(r[valKey]) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
}

async function fetchShopifyTable(shop: string, token: string, query: string, isoRange: string, tag: string) {
  return unstable_cache(
    async () => {
      const [startDate, endDate] = isoRange.split(',')
      return runShopifyQlTable({ shop, token, query, startDate, endDate })
    },
    ['shopify', tag, shop, isoRange, keyHash(query)],
    { revalidate: 3600 },
  )()
}

export async function resolveShopifyGrouped(
  b: ShopifyBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  if (!b.dimensions || b.dimensions.length !== 1) {
    throw new InvalidMetricError('resolveShopifyGrouped requires a single dimension')
  }
  const dim = b.dimensions[0]
  if (!SHOPIFY_DIM_RE.test(dim)) throw new InvalidMetricError(`unsafe Shopify dimension: ${dim}`)

  const creds = resolveShopifyCreds(ctx.slug, process.env)
  if (!creds) throw new DisconnectedError(`Shopify not connected for ${ctx.slug}`)
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const query = `${b.query} GROUP BY ${dim}`
  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [cur, prior] = await Promise.all([
    fetchShopifyTable(creds.shop, creds.token, query, `${startDate},${endDate}`, 'grouped').then(groupRowsFromShopify),
    compareIso ? fetchShopifyTable(creds.shop, creds.token, query, compareIso, 'grouped').then(groupRowsFromShopify) : Promise.resolve(null),
  ])
  return joinGrouped(cur, prior, dim)
}

export async function resolveShopifySeries(
  b: ShopifyBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  const creds = resolveShopifyCreds(ctx.slug, process.env)
  if (!creds) throw new DisconnectedError(`Shopify not connected for ${ctx.slug}`)
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const query = `${b.query} GROUP BY ${granularity}`
  const { startDate, endDate } = parseDateRange(dateRange)
  const compareIso = resolveCompareIso(dateRange, compareRange)

  const [cur, prior] = await Promise.all([
    fetchShopifyTable(creds.shop, creds.token, query, `${startDate},${endDate}`, 'series').then(seriesPointsFromShopify),
    compareIso ? fetchShopifyTable(creds.shop, creds.token, query, compareIso, 'series').then(seriesPointsFromShopify) : Promise.resolve(null),
  ])
  return alignSeries(cur, prior)
}
