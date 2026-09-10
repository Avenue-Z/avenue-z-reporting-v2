import type { Ga4Config } from '@/lib/db/schema'
import type { GA4DimensionFilter, GA4Row } from './types'

/** Every underlying GA4 event name covered by a client's lead-event allowlist, de-duplicated. */
export function leadEventNames(config: Ga4Config): string[] {
  return Array.from(new Set(config.leadEvents.flatMap((e) => e.sourceEvents)))
}

/** GA4 dimensionFilter restricting `eventName` to a client's lead-event allowlist. */
export function leadEventFilter(config: Ga4Config): GA4DimensionFilter {
  return {
    filter: { fieldName: 'eventName', inListFilter: { values: leadEventNames(config) } },
  }
}

/** Sums `eventCount` across every row of a `leadEventFilter`-scoped GA4 query. */
export function sumLeadEventConversions(rows: GA4Row[] | null | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row.eventCount) || 0), 0)
}
