// lib/dashboard/adapters/triplewhale.ts
import { twSql, twValue, TwQueryError } from '@/lib/triplewhale/client'
import { buildMetricSql, isTwMetric } from '@/lib/triplewhale/queries'
import type { LeafValue, TripleWhaleBinding } from '../types'
import { DisconnectedError, NoDataError } from '../errors'

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
  if (!isTwMetric(b.metric)) throw new TwQueryError(`Unknown TripleWhale metric: ${b.metric}`)

  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const apiKey = process.env.TRIPLE_WHALE_API_KEY
  const shopId = (await getClientBySlug(ctx.slug))?.triplewhaleShopId
  if (!apiKey || !shopId) throw new DisconnectedError(`TripleWhale not connected for ${ctx.slug}`)

  const query = buildMetricSql(b.metric)
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
