// TODO: real TripleWhale REST API. Stub until creds + metric catalog land (spec §5).
import type { LeafValue, TripleWhaleBinding } from '../types'

/** Deterministic pseudo-value in [0, 1000). No Math.random/Date — stable across runs. */
export function stubValue(metric: string, salt: string): number {
  let h = 0
  const s = metric + '|' + salt
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 100000) / 100
}

export async function resolveTripleWhaleLeaf(
  b: TripleWhaleBinding,
  _ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  const value = stubValue(b.metric, dateRange)
  const prevValue = compareRange ? stubValue(b.metric, 'prev:' + dateRange) : undefined
  return { value, prevValue }
}
