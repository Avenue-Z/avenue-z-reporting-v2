/**
 * Coerces a Supermetrics numeric field to a finite number. Number(x) returns NaN
 * on something like a stringified '1,234.56', and one NaN would poison an entire
 * reduce or a currentWeek / previousWeek figure. Falls back to 0 instead. Shared
 * by pipeline.ts and contacts.ts so the coercion rule and the warn message stay
 * in exactly one place.
 *
 * `undefined` is handled as its own case, distinct from an unparseable value. A
 * renamed, dropped, or subtly wrong field_id leaves the key entirely absent from
 * the row, and `Number(undefined ?? 0)` silently evaluates to a finite 0, so the
 * `!Number.isFinite(n)` guard below would never fire for that failure. Left
 * unguarded, a bad field id renders a client with a full pipeline block reading
 * all zeros and nothing logged. Warn distinctly so the two cases are
 * distinguishable in logs (a truly absent key vs. a present-but-garbled value).
 */
export function toNumber(v: unknown): number {
  if (v === undefined) {
    console.warn(`[salesforce] numeric field missing (undefined), defaulting to 0:`, v)
    return 0
  }
  const n = Number(v ?? 0)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] unparseable numeric value, defaulting to 0:`, v)
  return 0
}

/**
 * Coerces a Supermetrics boolean-shaped field (opportunity_is_closed) to a real
 * boolean. Field values arrive as JS booleans in practice, but parseSmRows
 * types every value as a string, so that is an unguaranteed API detail rather
 * than a promise Salesforce/Supermetrics makes. Accepts the real boolean, the
 * strings 'true'/'True'/'false'/'False', and the numeric forms 1/0 (as number
 * or string).
 *
 * Anything unrecognised warns and falls back to `true` (CLOSED), not `false`
 * (open). This function exists specifically for the is_closed field, and both
 * call sites (transformPipeline's open filter, transformByOwner's open filter)
 * treat "not closed" as open. Defaulting an unrecognised value to "not closed"
 * would silently OVERSTATE open pipeline, exactly the failure this guards
 * against, so the fallback is the direction that instead UNDERCOUNTS (a deal
 * quietly excluded from the open tiles), which is the safer failure for a
 * client-facing headline number.
 */
export function toBool(v: unknown): boolean {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  if (v === 1) return true
  if (v === 0) return false
  console.warn(`[salesforce] unrecognised boolean value, defaulting to closed:`, v)
  return true
}
