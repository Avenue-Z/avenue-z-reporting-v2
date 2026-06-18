import type { LeafBinding, LeafValue } from './types'
import { resolveSupermetricsLeaf } from './adapters/supermetrics'
import { resolveTripleWhaleLeaf } from './adapters/triplewhale'

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
  }
}
