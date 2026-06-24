// lib/dashboard/adapters/triplewhale.ts
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createHash } from 'node:crypto'
import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
import { buildMetricSql } from '@/lib/triplewhale/queries'
import type { LeafValue, TripleWhaleBinding } from '../types'
import { DisconnectedError, NoDataError } from '../errors'

const keyHash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/** Stable cross-render cache-key parts for one TW metric query (raw key hashed). */
export function twDataKey(apiKey: string, shopId: string, query: string, isoRange: string): string[] {
  return ['tw-data', shopId, query, isoRange, keyHash(apiKey)]
}

// Request-scoped dedupe (react cache) around cross-request persistence (unstable_cache).
const cachedTwValue = cache(
  (apiKey: string, shopId: string, query: string, isoRange: string): Promise<number> =>
    unstable_cache(
      async () => {
        const [startDate, endDate] = isoRange.split(',')
        const rows = await twSql({ apiKey, shopId, query, startDate, endDate })
        const v = twValue(rows)
        if (v === null) throw new NoDataError(`no TripleWhale data for ${query} in ${isoRange}`)
        return v
      },
      twDataKey(apiKey, shopId, query, isoRange),
      { revalidate: 3600 },
    )(),
)

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
  const fetchValue = (isoRange: string): Promise<number> => cachedTwValue(apiKey, shopId, query, isoRange)

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}
