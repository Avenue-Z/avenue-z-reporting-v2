/**
 * Percent change of `cur` vs `prev`. Returns undefined when there is no usable
 * baseline (prev null/undefined/0) so callers hide the delta rather than show a
 * misleading zero or divide-by-zero. Canonical home of this rule; lib/paid-search
 * has a private copy slated to migrate here (see spec §5).
 */
export function computeDelta(cur: number, prev: number | null | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}
