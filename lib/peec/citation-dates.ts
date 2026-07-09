// lib/peec/citation-dates.ts
// FB-068: pure citation-date aggregation used by the PR Influence matchback.
// Builds, per host, the first/last date a citation was observed, both overall
// (the '*' any-engine roll-up) and per engine label. This is the shared helper
// that P8 exists to replace duplicated ad hoc date-scanning with.

import { normHost } from '@/lib/pr-proof/matchback'
import { normalizeEngine } from '@/lib/peec/url-citations'

/** '*' is the any-engine roll-up key; every other key is an engine label
 *  (e.g. 'ChatGPT') as returned by normalizeEngine(). */
export type CitationDateIndex = Record<string, Record<string, { first: string; last: string }>>

export type ApiDomainDateRow = {
  domain: string
  date: string
  model?: { id: string }
  citation_count?: number
}

/** Roll up domain/date rows into a per-host, per-engine (plus '*') first/last
 *  citation-date index. Dates are ISO YYYY-MM-DD strings, so plain string
 *  min/max is correct (they sort lexically). */
export function buildCitationDateIndex(rows: ApiDomainDateRow[]): CitationDateIndex {
  const index: CitationDateIndex = {}

  const touch = (host: string, key: string, date: string) => {
    if (!index[host]) index[host] = {}
    const existing = index[host][key]
    if (!existing) {
      index[host][key] = { first: date, last: date }
      return
    }
    if (date < existing.first) existing.first = date
    if (date > existing.last) existing.last = date
  }

  for (const row of rows) {
    const host = normHost(row.domain ?? '')
    if (!host || !row.date) continue
    touch(host, '*', row.date)
    const engine = normalizeEngine(row.model?.id ?? '')
    if (engine) touch(host, engine, row.date)
  }

  return index
}
