// lib/ga4/first-visit.ts
// Content Impact §C: days from publish to the first search visit and the first
// AI-referred visit (D-1, D-9). Two GA4 queries filtered to the measured pages
// and to the channel each card counts, so GA4 returns only pagePath × date rows
// that can matter; the cache holds the derived first-visit dates, never the
// rows. The old single pagePath × date × source × channel query reached 3 MB
// for avenue-z, over Next's 2 MB data-cache limit, and grew every day.
import { cached } from '@/lib/cache'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import type { CalendarPage } from '@/lib/content-calendar/pages'
import { normPath } from '@/lib/peec/content-performance-rows'
import { computeUrlTiming, median } from './content-derive'
import { ga4QueryUncached } from './client'
import type { GA4DimensionFilter, GA4Row } from './types'

/** GA4 default channel group counted as a search visit (D-1; same grouping as the KPI strip). */
export const ORGANIC_SEARCH_CHANNEL = 'Organic Search'

/** A measured page: GA4 path (trailing slash stripped), live URL, publish date. */
export type TimingPage = { path: string; url: string; publishDate: string }
/** What the GA4 fetch needs per page. */
export type TimingAnchor = { path: string; publishDate: string }
/** ISO first-visit dates (on or after the anchor's publish date), null when none yet. */
export type FirstVisit = { firstSearch: string | null; firstAi: string | null }
/** `complete: false` = GA4 truncated the result: the cards show `--`, never a late first visit. */
export type FirstVisits = { complete: boolean; byAnchor: Record<string, FirstVisit> }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function pathOf(url: string): string | null {
  try { return new URL(url).pathname } catch { return url.startsWith('/') ? url : null }
}

/** §C universe (D-9): published, New (or New · Optimized) pages with a URL and an ISO publish date. */
export function timingUniverse(pages: CalendarPage[]): TimingPage[] {
  const out: TimingPage[] = []
  for (const p of pages) {
    if (!p.published || (p.badge !== 'new' && p.badge !== 'new-optimized')) continue
    if (!p.url || !p.publishDate || !ISO_DATE.test(p.publishDate)) continue
    const path = pathOf(p.url)
    if (path !== null) out.push({ path: normPath(path), url: p.url, publishDate: p.publishDate })
  }
  return out
}

/** One anchor per (path, publish date), sorted: the fetcher's cache key must not depend on calendar order. */
export function timingAnchors(pages: TimingPage[]): TimingAnchor[] {
  const seen = new Map<string, TimingAnchor>()
  for (const { path, publishDate } of pages) seen.set(anchorKey(path, publishDate), { path, publishDate })
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v)
}

export function anchorKey(path: string, publishDate: string): string {
  return `${normPath(path)} ${publishDate}`
}

/** GA4's inList match is exact and a path may be stored with or without its trailing slash: ask for both. */
function pathVariants(p: string): string[] {
  const stripped = normPath(p)
  return stripped === '/' ? ['/'] : [stripped, `${stripped}/`]
}

/** Channel rules as GA4 filters. AI = `isAiSource`: sessionSource contains a listed domain, case-insensitive. */
export function firstVisitFilters(pathValues: string[]): { search: GA4DimensionFilter; ai: GA4DimensionFilter } {
  const paths = { filter: { fieldName: 'pagePath', inListFilter: { values: pathValues } } }
  return {
    search: { andGroup: { expressions: [
      paths,
      { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: ORGANIC_SEARCH_CHANNEL, caseSensitive: true } } },
    ] } },
    ai: { andGroup: { expressions: [
      paths,
      { orGroup: { expressions: AI_REFERRER_DOMAINS.map((d) => (
        { filter: { fieldName: 'sessionSource', stringFilter: { matchType: 'CONTAINS', value: d, caseSensitive: false } } }
      )) } },
    ] } },
  }
}

function datesWithSessions(rows: GA4Row[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of rows) {
    if (!((Number(r.sessions) || 0) > 0)) continue
    const ds = String(r.date ?? '')
    const iso = ds.length === 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : ds
    const p = normPath(String(r.pagePath ?? ''))
    if (!out.has(p)) out.set(p, [])
    out.get(p)!.push(iso)
  }
  return out
}

function firstOnOrAfter(dates: string[] | undefined, from: string): string | null {
  let best: string | null = null
  for (const d of dates ?? []) if (d >= from && (best === null || d < best)) best = d
  return best
}

/** Per anchor, the first day with a session on or after its publish date (computeUrlTiming's rule). */
export function firstVisitsFromRows(anchors: TimingAnchor[], searchRows: GA4Row[], aiRows: GA4Row[]): Record<string, FirstVisit> {
  const search = datesWithSessions(searchRows)
  const ai = datesWithSessions(aiRows)
  const out: Record<string, FirstVisit> = {}
  for (const { path, publishDate } of anchors) {
    out[anchorKey(path, publishDate)] = {
      firstSearch: firstOnOrAfter(search.get(normPath(path)), publishDate),
      firstAi: firstOnOrAfter(ai.get(normPath(path)), publishDate),
    }
  }
  return out
}

async function getFirstVisitDatesImpl(clientSlug: string, anchors: TimingAnchor[], endDate: string): Promise<FirstVisits> {
  if (anchors.length === 0) return { complete: true, byAnchor: {} }
  const minPublish = anchors.reduce((m, a) => (a.publishDate < m ? a.publishDate : m), anchors[0].publishDate)
  const filters = firstVisitFilters([...new Set(anchors.flatMap((a) => pathVariants(a.path)))])
  const run = (dimensionFilter: GA4DimensionFilter) => ga4QueryUncached({
    clientSlug,
    dateRange: `${minPublish},${endDate}`,
    metrics: ['sessions'],
    dimensions: ['pagePath', 'date'],
    dimensionFilter,
    limit: 100000,
  })
  const [search, ai] = await Promise.all([run(filters.search), run(filters.ai)])
  if (search.rowCount > search.rows.length || ai.rowCount > ai.rows.length) {
    console.warn(`[first-visit] GA4 truncated the first-visit rows for ${clientSlug}; §C shows --`)
    return { complete: false, byAnchor: {} }
  }
  return { complete: true, byAnchor: firstVisitsFromRows(anchors, search.rows, ai.rows) }
}

export const getFirstVisitDates = cached('ga4', 'firstVisitDates', getFirstVisitDatesImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug }),
})

export type TimingSummary = {
  medFirstSearch: number | null
  medFirstAi: number | null
  fastestAi: number | null
  slowestAi: number | null
  fastestAiUrl: string | null
  slowestAiUrl: string | null
}

/** §C's four cards from the derived dates; days math stays in computeUrlTiming. */
export function summariseTiming(pages: TimingPage[], byAnchor: Record<string, FirstVisit>): TimingSummary {
  const timings = pages.map((p) => {
    const f = byAnchor[anchorKey(p.path, p.publishDate)]
    const days = [
      ...(f?.firstSearch ? [{ date: f.firstSearch, aiSessions: 0, searchSessions: 1 }] : []),
      ...(f?.firstAi ? [{ date: f.firstAi, aiSessions: 1, searchSessions: 0 }] : []),
    ]
    return { url: p.url, ...computeUrlTiming({ publishDate: p.publishDate, days }) }
  })
  const search = timings.map((t) => t.daysToFirstSearch).filter((n): n is number => n !== null)
  const ai = timings.map((t) => t.daysToFirstAi).filter((n): n is number => n !== null)
  const fastestAi = ai.length ? Math.min(...ai) : null
  const slowestAi = ai.length ? Math.max(...ai) : null
  return {
    medFirstSearch: median(search),
    medFirstAi: median(ai),
    fastestAi,
    slowestAi,
    fastestAiUrl: fastestAi !== null ? timings.find((t) => t.daysToFirstAi === fastestAi)?.url ?? null : null,
    slowestAiUrl: slowestAi !== null ? timings.find((t) => t.daysToFirstAi === slowestAi)?.url ?? null : null,
  }
}

export const EMPTY_TIMING: TimingSummary = {
  medFirstSearch: null, medFirstAi: null, fastestAi: null, slowestAi: null, fastestAiUrl: null, slowestAiUrl: null,
}

export type TimingStatus = 'ok' | 'ga4-not-connected' | 'no-new-content' | 'unavailable'

/** Why §C has nothing to show, if it doesn't. A failed calendar is "couldn't load", not "no content". */
export function timingStatus(input: {
  ga4Connected: boolean
  calendarFailed: boolean
  universeSize: number
  result: FirstVisits | null
}): TimingStatus {
  if (!input.ga4Connected) return 'ga4-not-connected'
  if (input.calendarFailed) return 'unavailable'
  if (input.universeSize === 0) return 'no-new-content'
  if (!input.result || !input.result.complete) return 'unavailable'
  return 'ok'
}

/** Client-facing, so neutral: no vendor names, no error detail. */
export const TIMING_EMPTY_COPY: Record<Exclude<TimingStatus, 'ok'>, string> = {
  'ga4-not-connected': 'Connect GA4 to measure days to first visit.',
  'no-new-content': 'No new published content to measure yet.',
  unavailable: "Visit timing couldn't be loaded.",
}
