// lib/pr-proof/matchback.ts
// FB-067: pure PR placement matchback. Extracted from the inline logic in
// pr-influence.tsx so it can be unit tested against realistic fixtures.
//
// Tina 2026-07-09: the placement list is ALL TIME. The card dynamically shows
// only placements whose domain is CITED within the selected timeframe, NOT
// placements secured within the timeframe. "Cited within the timeframe" is read
// from urlCitations, which the caller fetches for the selected date range.
// Matching is domain-level (a placement is cited if any URL on its domain is
// cited in the period), consistent with how the card already reports engines.

import type { PRPlacement } from './types'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { AEOModel } from '@/lib/peec/models'
import type { CitationDateIndex } from '@/lib/peec/citation-dates'

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
 *                       dates, all time (not scoped to the selected period). Used
 *                       only to populate firstCitedDate/lastCitedDate; row inclusion
 *                       and citedByAI are still driven entirely by urlCitations.
 */
export function computePlacementMatchback(
  placements: PRPlacement[],
  urlCitations: UrlCitation[],
  models: AEOModel[] | null,
  citationDates: CitationDateIndex,
): MatchbackResult {
  // Hosts cited anywhere in the period (engine data optional), plus the union of
  // engines per host. Building citedHosts from ALL citations (not only ones with
  // engines) means a period-cited placement with no engine attribution still
  // counts as cited; it just renders with no engine chips.
  const citedHostsInPeriod = new Set<string>()
  const enginesByHost = new Map<string, Set<string>>()
  for (const c of urlCitations) {
    const h = normHost(c.domain)
    if (!h) continue
    citedHostsInPeriod.add(h)
    if (c.engines.length === 0) continue
    if (!enginesByHost.has(h)) enginesByHost.set(h, new Set())
    const set = enginesByHost.get(h)!
    for (const e of c.engines) set.add(e)
  }

  const modelSet = models && models.length > 0 ? new Set<string>(models) : null

  // First/most-recent citation date for a host, scoped to the active model
  // filter (or the "*" any-engine roll-up when there is no filter). This is
  // ALL TIME data from citationDates, unrelated to the selected-period
  // citedHostsInPeriod/enginesByHost above, which only decide row inclusion.
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
    const h = normHost(p.domain)
    if (!citedHostsInPeriod.has(h)) continue // not cited in the selected timeframe
    const aiEnginesCiting = [...(enginesByHost.get(h) ?? [])]
    if (modelSet) {
      // A model filter needs engine attribution to decide inclusion.
      if (aiEnginesCiting.length === 0) continue
      if (!aiEnginesCiting.some((e) => modelSet.has(e))) continue
    }
    const { first, last } = datesFor(h)
    rows.push({
      outlet: p.outlet ?? p.domain,
      headline: p.headline ?? p.domain,
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
