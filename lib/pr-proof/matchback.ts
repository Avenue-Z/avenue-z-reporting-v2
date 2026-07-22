// lib/pr-proof/matchback.ts
// FB-067: pure PR placement matchback. Extracted from the inline logic in
// pr-influence.tsx so it can be unit tested against realistic fixtures.
//
// Tina 2026-07-09: the placement list is ALL TIME. The card dynamically shows
// only placements CITED within the selected timeframe, NOT placements secured
// within the timeframe. "Cited within the timeframe" is read from urlCitations,
// which the caller fetches for the selected date range.
//
// FB-069 (supersedes the domain-level rule above): matching is on the ARTICLE
// URL, not the domain. Bristol's 2026-07-20 report showed the cost of the old
// rule: a dig-in.com placement was reported as cited in ChatGPT because *other*
// dig-in.com articles appeared in Peec, while our own URL never did. A row now
// requires an intersection of two things — the placement exists in the client's
// PR Proof sheet, and that same article URL appears in Peec's citations for the
// period. A citation of a different article on the same publication no longer
// qualifies a placement, and engine chips are scoped to the cited article too.
//
// Both sides are normalized with urlJoinKey (lowercase, no protocol, no leading
// "www.", no query/hash, no trailing slash), so the sheet's
// "https://www.benefitnews.com/news/x" matches Peec's "https://benefitnews.com/news/x".

import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { AEOModel } from '@/lib/peec/models'
import type { CitationDateIndex } from '@/lib/peec/citation-dates'
import { urlJoinKey } from '@/lib/url'

/** One matchback row for the "which placements are cited" table. */
export interface MatchbackRow {
  outlet: string
  headline: string
  link: string
  publicationDate: string
  citedByAI: boolean
  aiEnginesCiting: string[]
  /** Earliest citation date for this host, scoped to the active model filter
   *  (or the "*" any-engine roll-up when there is no filter). Empty string
   *  when the host has no entry in the citation-date index ("N/A" in the UI). */
  firstCitedDate: string
  /** Most-recent citation date for this host, same scoping as firstCitedDate. */
  lastCitedDate: string
}

export interface MatchbackResult {
  /** Placements cited within the period (and, under a model filter, cited by a
   *  selected engine). This is exactly what the table renders. */
  rows: MatchbackRow[]
  /** rows.length. The N in "N of M placements cited by AI". */
  citedCount: number
  /** placements.length. The all-time M in "N of M placements cited by AI". */
  totalPlacements: number
}

/** Normalize a host for matching: trim, lowercase, strip a leading "www.".
 *  Mirrors hostOf()/lookupHost() in lib/peec/url-citations.ts and is idempotent. */
export function normHost(s: string): string {
  return s.trim().toLowerCase().replace(/^www\./, '')
}

/**
 * Build the placement matchback for a period.
 *
 * @param placements    All-time PR-secured placements (from the PR Proof Library).
 * @param urlCitations  Per-URL citations for the SELECTED date range only.
 * @param models        Active AI-model filter, or null for all models.
 * @param citationDates Per-host, per-engine (plus "*" roll-up) first/last citation
 *                       dates, bounded to the selected timeframe (the same window
 *                       used for urlCitations below). Used only to populate
 *                       firstCitedDate/lastCitedDate; row inclusion and citedByAI
 *                       are still driven entirely by urlCitations.
 */
export function computePlacementMatchback(
  placements: PRPlacement[],
  urlCitations: UrlCitation[],
  models: AEOModel[] | null,
  citationDates: CitationDateIndex,
): MatchbackResult {
  // Article URLs cited anywhere in the period (engine data optional), plus the
  // union of engines per URL. Building citedUrls from ALL citations (not only
  // ones with engines) means a period-cited placement with no engine attribution
  // still counts as cited; it just renders with no engine chips.
  //
  // Peec already supplies a urlKey built with urlJoinKey; fall back to deriving
  // it from the raw url so a citation missing that field is not silently lost.
  const citedUrlsInPeriod = new Set<string>()
  const enginesByUrl = new Map<string, Set<string>>()
  for (const c of urlCitations) {
    const k = c.urlKey || urlJoinKey(c.url)
    if (!k) continue
    citedUrlsInPeriod.add(k)
    if (c.engines.length === 0) continue
    if (!enginesByUrl.has(k)) enginesByUrl.set(k, new Set())
    const set = enginesByUrl.get(k)!
    for (const e of c.engines) set.add(e)
  }

  const modelSet = models && models.length > 0 ? new Set<string>(models) : null

  // First/most-recent citation date for a host, scoped to the active model
  // filter (or the "*" any-engine roll-up when there is no filter). citationDates
  // is bounded to the selected timeframe (same window as citedUrlsInPeriod/
  // enginesByUrl above), which only decide row inclusion, not the date values.
  //
  // NOTE: these two dates remain DOMAIN-scoped even though row inclusion is now
  // article-scoped. Peec's /reports/domains endpoint, which backs this index,
  // returns domain + date with no URL, so per-article dates would need a
  // different fetch. Tracked as a follow-up, not covered by FB-069.
  const datesFor = (h: string): { first: string; last: string } => {
    const perEngine = citationDates[h]
    if (!perEngine) return { first: '', last: '' }
    if (!modelSet) {
      const rollup = perEngine['*']
      return rollup ? { first: rollup.first, last: rollup.last } : { first: '', last: '' }
    }
    let first = ''
    let last = ''
    for (const engine of modelSet) {
      const entry = perEngine[engine]
      if (!entry) continue
      if (!first || entry.first < first) first = entry.first
      if (!last || entry.last > last) last = entry.last
    }
    return { first, last }
  }

  const rows: MatchbackRow[] = []
  for (const p of placements) {
    // FB-069: the intersection. Both the sheet entry and the Peec citation have
    // to point at the same article, not merely the same publication.
    const k = urlJoinKey(p.link)
    if (!k) continue // no usable link on the sheet row
    if (!citedUrlsInPeriod.has(k)) continue // this article was not cited in the period
    // Host is still needed for the citation-date index, which Peec only exposes
    // per domain (see citation-dates.ts), so first/last remain domain-scoped.
    //
    // Review F5: row inclusion keys off the article URL, but the date index is
    // keyed by whatever host Peec recorded. Those agree for all 290 real
    // placements today (client.ts:170 derives Domain FROM the link), but they are
    // separately sourced, so try the link host first and fall back to the sheet's
    // Domain column rather than silently rendering "N/A" on a mismatch.
    const aiEnginesCiting = [...(enginesByUrl.get(k) ?? [])]
    if (modelSet) {
      // A model filter needs engine attribution to decide inclusion.
      if (aiEnginesCiting.length === 0) continue
      if (!aiEnginesCiting.some((e) => modelSet.has(e))) continue
    }
    const linkHost = k.split('/')[0]
    const sheetHost = normHost(p.domain ?? '')
    let { first, last } = datesFor(linkHost)
    if (!first && !last && sheetHost && sheetHost !== linkHost) {
      ({ first, last } = datesFor(sheetHost))
    }
    rows.push({
      outlet: p.outlet ?? p.domain,
      // FB-069 Req 3: this used to read `p.headline ?? p.domain`. That fallback
      // was dead — parseRows always produces a string (client.ts:148-151), and
      // `??` does not catch '' — so a blank title silently rendered an invisible
      // link. The UI now owns that case with a visible warning, so the blank must
      // pass through unchanged rather than being papered over here.
      headline: p.headline,
      link: p.link ?? '',
      publicationDate: p.publicationDate ?? '',
      citedByAI: true,
      aiEnginesCiting,
      firstCitedDate: first,
      lastCitedDate: last,
    })
  }

  return { rows, citedCount: rows.length, totalPlacements: placements.length }
}
