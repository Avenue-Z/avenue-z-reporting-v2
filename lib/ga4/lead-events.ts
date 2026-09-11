import type { Ga4Config } from '@/lib/db/schema'
import type { GA4DimensionFilter, GA4Row } from './types'

/**
 * Every underlying GA4 event name covered by a client's lead-event allowlist,
 * de-duplicated. `ga4Config` is unvalidated jsonb (`.$type<Ga4Config>()` is a
 * compile-time cast, nothing enforces the shape at read or write time), so
 * this tolerates a missing OR WRONGLY-TYPED `leadEvents`/`sourceEvents`
 * rather than throwing — a hand-edited `{}`, `{"leadEvents": null}`, or
 * `{"leadEvents": "oops"}` row must degrade to "no lead events configured,"
 * not take down the page. `Array.isArray`, not `?? []`: the latter only
 * guards null/undefined and still throws on a present-but-wrong-shaped
 * value (a string, a number, a bare object) — round two of this exact bug.
 * Also drops any non-string or blank source-event name, since either one
 * reaching the GA4 filter is a request that runs and silently matches
 * nothing, not an error anyone would see.
 */
export function leadEventNames(config: Ga4Config | null | undefined): string[] {
  const events = Array.isArray(config?.leadEvents) ? config.leadEvents : []
  const sourceEvents = events.flatMap((e) => (Array.isArray(e?.sourceEvents) ? e.sourceEvents : []))
  return Array.from(new Set(sourceEvents.filter((s): s is string => typeof s === 'string' && s.length > 0)))
}

/**
 * Whether `config` has at least one real event name to filter on. Callers
 * should treat `false` identically to a null `ga4Config` (fall back to the
 * client's raw GA4 numbers) — an `inListFilter` with an empty `values` array
 * is rejected by the GA4 Data API outright, which would otherwise surface as
 * every query failing rather than as "this client just isn't configured".
 */
export function hasLeadEvents(config: Ga4Config | null | undefined): boolean {
  return leadEventNames(config).length > 0
}

/** GA4 dimensionFilter restricting `eventName` to a client's lead-event allowlist. Only call when hasLeadEvents(config) is true. */
export function leadEventFilter(config: Ga4Config): GA4DimensionFilter {
  return {
    filter: { fieldName: 'eventName', inListFilter: { values: leadEventNames(config) } },
  }
}

/**
 * Sums `eventCount` across every row of a `leadEventFilter`-scoped GA4 query.
 * Returns `null` — not 0 — for `null`/`undefined` input, so a caller can tell
 * "the fetch failed or never ran" apart from "it ran and found nothing this
 * period", which is a real, different fact and must render differently (a
 * dash, not a fabricated zero).
 */
export function sumLeadEventConversions(rows: GA4Row[] | null | undefined): number | null {
  if (rows == null) return null
  return rows.reduce((sum, row) => sum + (Number(row.eventCount) || 0), 0)
}
