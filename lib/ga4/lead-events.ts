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
 * Also drops any non-string or blank (including whitespace-only) source-event
 * name, since any of those reaching the GA4 filter is a request that runs
 * and silently matches nothing, not an error anyone would see — the same
 * failure mode `lib/salesforce/campaign-filter.ts` already guards against
 * for campaign names, with the same fix (trim, not just a length check).
 */
export function leadEventNames(config: Ga4Config | null | undefined): string[] {
  const events = Array.isArray(config?.leadEvents) ? config.leadEvents : []
  const sourceEvents = events.flatMap((e) => (Array.isArray(e?.sourceEvents) ? e.sourceEvents : []))
  return Array.from(new Set(
    sourceEvents.filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
  ))
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
 * dash, not a fabricated zero). Also `null` if ANY row's `eventCount` fails
 * to parse as a genuine number (a GA4 response-shape change, a metric-header
 * mismatch) — treating one bad row as a silent `0` would quietly undercount
 * a real total, the same class of wrong-but-plausible number this feature
 * exists to stop shipping. An explicit blank check first, not just
 * `Number.isFinite` on the result: `Number('')`, `Number('  ')` and
 * `Number([])` all coerce to `0` in JS, which would slip a genuinely blank
 * cell (a real GA4 response shape — `lib/supermetrics`'s `parseSmRows` fills
 * a missing metric cell with `''` elsewhere in this repo) past a NaN check
 * as a silent contribution instead of failing the sum.
 */
export function sumLeadEventConversions(rows: GA4Row[] | null | undefined): number | null {
  if (rows == null) return null
  let sum = 0
  for (const row of rows) {
    const raw = row.eventCount
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      console.warn(`sumLeadEventConversions: blank eventCount for row ${JSON.stringify(row)} — treating the whole sum as unknown`)
      return null
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      console.warn(`sumLeadEventConversions: unparseable eventCount ${JSON.stringify(raw)} for row ${JSON.stringify(row)} — treating the whole sum as unknown`)
      return null
    }
    sum += n
  }
  return sum
}

export interface DerivedConversions {
  conversions: number | null | undefined
  conversionRate: number | null | undefined
}

/**
 * The single source of truth for what a Conversions/Conversion Rate surface
 * shows, given a three-state `trueConversions` (see `sumLeadEventConversions`)
 * plus the client's raw GA4 totals for that same period. Used by BOTH the
 * Executive Overview KPI tile and the journey-stage card — one function, not
 * two copies kept in sync by hand, which is exactly the shape of the PR `#235`
 * round-one regression (the two copies drifted; nothing forced them not to).
 *
 *   - `trueConversions === undefined`: no effective `ga4Config`. Returns the
 *     raw `conversions` / `sessionConversionRate` GA4 metrics unchanged —
 *     the behavior every client had before this feature existed.
 *   - `trueConversions === null`: `ga4Config` is set but the filtered fetch
 *     failed (or returned an unparseable row). Both fields are `null` — a
 *     dash, never the raw count and never a fabricated 0.
 *   - `trueConversions` is a number (including 0): the real filtered value.
 *     `conversionRate` is derived from THIS over `sessions`, never blended
 *     with the raw `sessionConversionRate`, which counts a different
 *     definition of "conversion".
 */
export function deriveConversions(
  trueConversions: number | null | undefined,
  rawConversions: number | undefined,
  rawConversionRate: number | undefined,
  sessions: number | undefined,
): DerivedConversions {
  if (trueConversions === undefined) {
    return { conversions: rawConversions, conversionRate: rawConversionRate }
  }
  if (trueConversions === null) {
    return { conversions: null, conversionRate: null }
  }
  return {
    conversions: trueConversions,
    conversionRate: sessions ? trueConversions / sessions : null,
  }
}
