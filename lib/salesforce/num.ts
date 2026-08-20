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
 * Parses a Supermetrics boolean field, or returns undefined when the value is
 * not one this module recognises. Accepts real booleans, 1/0 (number or
 * string), and 'true'/'false'/'yes'/'no'/'y'/'n' (any case, trimmed): the
 * connector has been observed returning native booleans, but that is an
 * unguaranteed API detail, and a CRM export can carry any of the word forms.
 * Undefined is the signal callers count as a data-quality problem; use toBool
 * when you just need a value.
 */
export function parseBool(v: unknown): boolean | undefined {
  if (v === true || v === false) return v
  if (v === 1 || v === 0) return v === 1
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
  }
  return undefined
}

/**
 * Coerces a Supermetrics boolean field. Unrecognised values warn and fail
 * CLOSED (return true), because the caller uses this for is_closed and the
 * failure it prevents is overstating open pipeline. Failing closed is not free:
 * a garbled flag on a won-stage row lands that row in closedWon instead, which
 * is why callers also count unrecognised flags and surface them to the UI
 * (unrecognizedClosedFlags on PipelineData) rather than leaving the console
 * warn as the only signal. `field` names the column so the warn is actionable.
 */
export function toBool(v: unknown, field = 'unknown'): boolean {
  const parsed = parseBool(v)
  if (parsed !== undefined) return parsed
  console.warn(`[salesforce] boolean field "${field}" unrecognised, defaulting to closed:`, v)
  return true
}
