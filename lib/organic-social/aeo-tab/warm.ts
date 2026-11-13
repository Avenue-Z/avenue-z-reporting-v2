// lib/organic-social/aeo-tab/warm.ts
// The hourly cache warmer's URLs for the AEO Informed Social tab (spec 2026-11-12 section 4): the three views a client viewer opens first,
// Month, YTD and All time at the default min, on the portal, so client views and exports normally hit a warm cache. Staff views of the same
// window share those entries (the cache is keyed by the window, not the route). Pure.
import type { Client } from '@/lib/db/schema'
import { hasReportingMonths, type Clock } from '@/lib/organic-social/reporting-months'
import { lockedRangeFor } from '@/lib/organic-social/locked-range'
import { AEO_TAB_ID, hasAeoInformedTab } from './setting'
import type { AeoRange } from './params'

const RANGES: AeoRange[] = ['month', 'ytd', 'all']

/** At most this many months are warmed per client: the one a client viewer is served, and the next one they can pick (spec
 *  2026-11-13-aeo-warm-client-months-design.md). Bounded on purpose: a client without clientMonths can pick every opened month. */
export const WARM_MONTHS = 2

/**
 * The three views for each month a client viewer can pick, at most WARM_MONTHS.
 * - `served`: the newest month a client viewer is served (months[0], reporting-months.ts) for a client on locked months, else the page's
 *   default, last_30_days. Exactly the list warmed before this change.
 * - `extra`: the next month a client can pick (months[1]), or none. The route warms every client's `served` before any `extra`, so nothing
 *   warmed before moves behind a new URL.
 * None for a client without the tab, without Organic Social, or with no month open to clients.
 */
export function aeoWarmUrls(baseUrl: string, client: Client, clock: Clock): { served: string[]; extra: string[] } {
  const none = { served: [], extra: [] }
  if (!client.enabledReports.includes('organic-social') || client.hiddenReports?.includes('organic-social') || !hasAeoInformedTab(client)) return none
  const views = (range: string) => RANGES.map((r) => `${baseUrl}/portal/${client.slug}/reports?section=organic-social&subsection=${AEO_TAB_ID}${r === 'month' ? '' : `&aeo=${r}`}&dateRange=${encodeURIComponent(range)}`)
  if (!hasReportingMonths(client)) return { served: views('last_30_days'), extra: [] }
  const locked = lockedRangeFor(client, 'CLIENT_VIEWER', undefined, clock)
  const served = locked?.month?.dateRange ?? null
  if (!served) return none
  const next = (locked?.months ?? []).filter((m) => m.dateRange !== served).slice(0, WARM_MONTHS - 1)
  return { served: views(served), extra: next.flatMap((m) => views(m.dateRange)) }
}
