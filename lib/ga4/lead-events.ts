import type { Ga4Config } from '@/lib/db/schema'
import type { GA4DimensionFilter, GA4Row } from './types'

/**
 * Every underlying GA4 event name covered by a client's lead-event allowlist,
 * de-duplicated. `ga4Config` is unvalidated jsonb (`.$type<Ga4Config>()` is a
 * compile-time cast, nothing enforces the shape at read or write time), so
 * this tolerates a missing or malformed `leadEvents`/`sourceEvents` rather
 * than throwing — a hand-edited `{}` or `{"leadEvents": null}` row must
 * degrade to "no lead events configured", not take down the page.
 */
export function leadEventNames(config: Ga4Config | null | undefined): string[] {
  return Array.from(new Set((config?.leadEvents ?? []).flatMap((e) => e?.sourceEvents ?? [])))
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
