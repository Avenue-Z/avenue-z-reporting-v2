import { runShopifyQl } from '@/lib/shopify/client'
import type { LeafValue, ShopifyBinding } from '../types'
import { DisconnectedError } from '../errors'

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

  const fetchValue = (isoRange: string): Promise<number> => {
    const [startDate, endDate] = isoRange.split(',')
    return runShopifyQl({ shop: creds.shop, token: creds.token, query: b.query, startDate, endDate })
  }

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await fetchValue(`${startDate},${endDate}`)
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await fetchValue(compareIso) : undefined

  return { value, prevValue }
}
