/** True when v is null, undefined, or a string that is empty or whitespace only. */
function isMissing(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

/**
 * Coerces a Supermetrics numeric field to a finite number. parseSmRows fills a
 * missing or short cell with '', so an absent value arrives as '' or undefined,
 * not just undefined; all missing shapes warn and fall back to 0 rather than
 * coercing to a confident zero. An unparseable non-empty value warns separately.
 * `field` names the column so the warn is actionable.
 */
export function toNumber(v: unknown, field = 'unknown'): number {
  if (isMissing(v)) {
    console.warn(`[salesforce] numeric field "${field}" missing, defaulting to 0:`, v)
    return 0
  }
  const n = Number(typeof v === 'string' ? v.trim() : v)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] numeric field "${field}" unparseable, defaulting to 0:`, v)
  return 0
}

/**
 * Coerces a Supermetrics boolean field. Accepts real booleans, 'true'/'false'
 * (any case, trimmed), and 1/0 (number or string). Anything unrecognised warns
 * and fails CLOSED (returns true), because the caller uses this for is_closed
 * and the failure we prevent is overstating open pipeline.
 */
export function toBool(v: unknown, field = 'unknown'): boolean {
  if (v === true || v === false) return v
  if (v === 1 || v === 0) return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  }
  console.warn(`[salesforce] boolean field "${field}" unrecognised, defaulting to closed:`, v)
  return true
}
