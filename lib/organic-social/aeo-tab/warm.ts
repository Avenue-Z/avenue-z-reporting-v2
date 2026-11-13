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

/** None for a client without the tab or without Organic Social. The range: the newest month a client viewer is served for a client on locked
 *  months (none if no month is open to clients yet), else the page's default, last_30_days. */
export function aeoWarmUrls(baseUrl: string, client: Client, clock: Clock): string[] {
  if (!client.enabledReports.includes('organic-social') || client.hiddenReports?.includes('organic-social') || !hasAeoInformedTab(client)) return []
  const range = hasReportingMonths(client) ? lockedRangeFor(client, 'CLIENT_VIEWER', undefined, clock)?.month?.dateRange ?? null : 'last_30_days'
  if (!range) return []
  return RANGES.map((r) => `${baseUrl}/portal/${client.slug}/reports?section=organic-social&subsection=${AEO_TAB_ID}${r === 'month' ? '' : `&aeo=${r}`}&dateRange=${encodeURIComponent(range)}`)
}
