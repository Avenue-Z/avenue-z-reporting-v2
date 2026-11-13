// components/report-sections/organic-social/aeo-informed/copy.ts
// Every word the AEO Informed Social tab shows, in one place. Titles are the outline's, verbatim (spec 2026-11-12, R6 and section 3; the outline
// doc's "Graphs to Add", "BEFORE THE TABLES" and table headings). No dash characters in any of it.
import { AEO_RANGE_LABEL, type AeoRange } from '@/lib/organic-social/aeo-tab/params'
import type { FourthGraph, GraphId } from '@/lib/organic-social/aeo-informed'
import { pctCompact } from '@/lib/organic-social/format'

export const RANGE_LABEL: Record<AeoRange, string> = AEO_RANGE_LABEL
export const MIN_COMPETITORS_LABEL = 'Min competitors'

/** The graph titles, as the outline writes them. The fourth is "Citations on Instagram", or TikTok for a client whose fourthGraph says so
 *  (the outline: "Instagram, or other relevant social channels"). */
export const GRAPH_TITLE: Record<GraphId, string> = {
  used_as_source_all: 'Used as a source on Reddit, YouTube, Instagram, TikTok, and LinkedIn',
  citations_all: 'Citations on LinkedIn, TikTok, Reddit, YouTube, and Instagram',
  citations_linkedin: 'Citations on LinkedIn',
  citations_instagram: 'Citations on Instagram',
  citations_tiktok: 'Citations on TikTok',
}
export const fourthGraphTitle = (g: FourthGraph) => GRAPH_TITLE[g === 'tiktok' ? 'citations_tiktok' : 'citations_instagram']
export const NO_SOURCE_DATA = 'No source data'
export const PARTIAL_WEEK = '(partial week)'

/** The four tiles before the tables (the outline's "BEFORE THE TABLES"), over the client's own channels. */
export const TILES_LABEL = 'Your channels'
export const TILE = {
  urlsCited: { title: 'Total URLs cited', tooltip: "Your channels' URLs that AI answer engines cited at least once in this window." },
  retrievals: { title: 'Total retrievals', tooltip: "How many times AI answer engines retrieved your channels' URLs as sources in this window." },
  citations: { title: 'Total citations', tooltip: "How many times AI answer engines cited your channels' URLs in their answers in this window." },
  citationRate: {
    title: 'Average citation rate',
    tooltip: "Total citations divided by total retrievals across your channels, so a URL retrieved once can't swing it. Can be above 100% when a source is cited more than once per retrieval.",
  },
} as const
/** The change basis (Peec's default indicator: the same number of days just before), said on every tile (review-log minor 10). */
export const deltaLabel = (days: number) => `vs previous ${days} days`

export const ownTableTitle = (ownBrandName: string) => `${ownBrandName} Only Socials`
export const COMPETITOR_TABLE_TITLE = 'Competitor Socials'
export const COMPETITOR_LINE = 'Channels Peec has registered to a competitor brand.'
export const URL_GAPS_TITLE = 'URL Gaps'
export const URL_GAPS_LINE = 'Sources that mention competitors and not you.'
export const TABLE_EMPTY = 'No URLs in this window.'
export const SEARCH_PLACEHOLDER = 'Search URLs'
export const pagerLabel = (a: number, b: number, n: number) => `Showing ${a} to ${b} of ${n}`

export const COLUMN = {
  rank: '#', url: 'URL', urlType: 'URL type', mentions: 'Mentions', citationShare: 'Citation share', citationPosition: 'Citation position',
  retrievals: 'Retrievals', totalCitations: 'Total citations', citationRate: 'Citation rate',
} as const

export const notStartedText = (monthLabel: string) => `No data for ${monthLabel} yet.`
export const NO_DATA_FOR_WINDOW = 'No data for this window.'
export const TIMEOUT_TEXT = 'Peec is taking longer than usual. Try again in a minute.'

/** The dashboard's empty-cell mark, the one the Organic Social post cards use (post-card.tsx). */
export const EMPTY_MARK = '—'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (d: string) => `${MONTH[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`
/** The window under the range control, "Oct 1 to Oct 31, 2026", and for Month what it is compared with. Built from the strings, never a Date,
 *  so no time zone can move a day. */
export function periodLine(window: { start: string; end: string }, previousDays: number | null): string {
  const sameYear = window.start.slice(0, 4) === window.end.slice(0, 4)
  const range = `${day(window.start)}${sameYear ? '' : `, ${window.start.slice(0, 4)}`} to ${day(window.end)}, ${window.end.slice(0, 4)}`
  return previousDays === null ? range : `${range}, compared with the ${previousDays} days before`
}

/** Every percent on the tab, from a fraction (0.12 is 12%): the Organic Social rates' format (pctCompact: whole from 1%, one decimal below),
 *  except that zero reads "0%" like the whole-percent values beside it, never "0.0%". */
export const aeoPct = (fraction: number): string => (fraction === 0 ? '0%' : pctCompact(fraction * 100))
