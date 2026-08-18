/**
 * Coerces a Supermetrics numeric field to a finite number. Number(x) returns NaN
 * on something like a stringified '1,234.56', and one NaN would poison an entire
 * reduce or a currentWeek / previousWeek figure. Falls back to 0 instead. Shared
 * by pipeline.ts and contacts.ts so the coercion rule and the warn message stay
 * in exactly one place.
 */
export function toNumber(v: unknown): number {
  const n = Number(v ?? 0)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] unparseable numeric value, defaulting to 0:`, v)
  return 0
}
