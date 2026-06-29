import type { Granularity, GroupedRow, LeafBinding, LeafValue, SeriesPoint } from './types'
import { resolveSupermetricsLeaf, resolveSupermetricsGrouped, resolveSupermetricsSeries } from './adapters/supermetrics'
import { resolveTripleWhaleLeaf, resolveTripleWhaleGrouped, resolveTripleWhaleSeries } from './adapters/triplewhale'
import { resolveShopifyLeaf, resolveShopifyGrouped, resolveShopifySeries } from './adapters/shopify'

/** Real leaf dispatcher used at runtime. resolveBlock injects this by default. */
export function resolveLeaf(
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsLeaf(b, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleLeaf(b, ctx, dateRange, compareRange)
    case 'shopify':
      return resolveShopifyLeaf(b, ctx, dateRange, compareRange)
  }
}

/** Default grouped dispatcher. resolveGroupedBlock injects this by default. */
export function resolveGrouped(
  b: LeafBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<GroupedRow[]> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsGrouped(b, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleGrouped(b, ctx, dateRange, compareRange)
    case 'shopify':
      return resolveShopifyGrouped(b, ctx, dateRange, compareRange)
  }
}

/** Default series dispatcher. resolveSeriesBlock injects this by default. */
export function resolveSeries(
  b: LeafBinding,
  granularity: Granularity,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<SeriesPoint[]> {
  switch (b.source) {
    case 'supermetrics':
      return resolveSupermetricsSeries(b, granularity, ctx, dateRange, compareRange)
    case 'triplewhale':
      return resolveTripleWhaleSeries(b, granularity, ctx, dateRange, compareRange)
    case 'shopify':
      return resolveShopifySeries(b, granularity, ctx, dateRange, compareRange)
  }
}
