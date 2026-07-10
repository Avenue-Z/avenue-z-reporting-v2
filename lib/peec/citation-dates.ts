// lib/peec/citation-dates.ts
// FB-068: pure citation-date aggregation used by the PR Influence matchback.
// Builds, per host, the first/last date a citation was observed, both overall
// (the '*' any-engine roll-up) and per engine label. This is the shared helper
// that P8 exists to replace duplicated ad hoc date-scanning with.

import { normHost } from '@/lib/pr-proof/matchback'
import { normalizeEngine } from '@/lib/peec/url-citations'
import { cached } from '@/lib/cache'

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

/**
 * Merge an ascending-pass index (whose "first" values are reliable, since a
 * bounded walk of ascending-sorted rows sees the earliest dates first) with a
 * descending-pass index (whose "last" values are reliable, for the same
 * reason in reverse). A host or engine key present in only one pass falls
 * back to that pass's own {first,last} pair.
 */
export function mergeAscDescIndexes(asc: CitationDateIndex, desc: CitationDateIndex): CitationDateIndex {
  const merged: CitationDateIndex = {}
  const hosts = new Set([...Object.keys(asc), ...Object.keys(desc)])

  for (const host of hosts) {
    const ascKeys = asc[host] ?? {}
    const descKeys = desc[host] ?? {}
    const keys = new Set([...Object.keys(ascKeys), ...Object.keys(descKeys)])
    const entry: Record<string, { first: string; last: string }> = {}

    for (const key of keys) {
      const a = ascKeys[key]
      const d = descKeys[key]
      const first = a?.first ?? d?.first
      const last = d?.last ?? a?.last
      if (first && last) entry[key] = { first, last }
    }

    if (Object.keys(entry).length > 0) merged[host] = entry
  }

  return merged
}

// ── Live fetch: bounded asc/desc paginated walk of /reports/domains ────────
// FB-068: the PR matchback needs to know, per owned host, the first and last
// date Peec ever saw an AI citation for it (not just within a fixed report
// window). One ascending-sorted pass finds "first" cheaply (earliest rows
// arrive first); one descending-sorted pass finds "last" the same way. Both
// passes are bounded so a client with a huge citation history cannot spin an
// unbounded number of pages.

const BASE_URL = 'https://api.peec.ai/customer/v1'
const PAGE_LIMIT = 5000
const PAGE_CAP = 8

function getKey(): string {
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  if (!key) throw new Error('Missing env var: PEEC_AI_CUSTOMER_TOKEN')
  return key
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  return res.json()
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }

/** Default window when the caller passes neither startDate nor endDate:
 *  the trailing 30 days, matching the other Peec fetchers in this module. */
function defaultWindow() {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29)
  return { start_date: isoDate(start), end_date: isoDate(end) }
}

/**
 * Bounded paginated walk of POST /reports/domains, either ascending
 * (no order_by, the API's default sort) or descending (order_by date desc).
 * Stops on the first of: every normalized targetHost has appeared at least
 * once, a page returns fewer than PAGE_LIMIT rows (last page), or PAGE_CAP
 * pages have been fetched.
 */
async function walkDomainDates(
  pid: string,
  window: { start_date: string; end_date: string },
  targetHostsNorm: Set<string>,
  order: 'asc' | 'desc',
): Promise<ApiDomainDateRow[]> {
  const rows: ApiDomainDateRow[] = []
  const seenHosts = new Set<string>()

  for (let page = 0; page < PAGE_CAP; page++) {
    const body: Record<string, unknown> = {
      project_id: pid,
      start_date: window.start_date,
      end_date: window.end_date,
      dimensions: ['model_id', 'date'],
      limit: PAGE_LIMIT,
      offset: page * PAGE_LIMIT,
    }
    if (order === 'desc') body.order_by = [{ field: 'date', order: 'desc' }]

    const res = await post<{ data: ApiDomainDateRow[] }>('/reports/domains', body)
    const pageRows = res.data ?? []
    rows.push(...pageRows)

    if (targetHostsNorm.size > 0) {
      for (const r of pageRows) {
        const host = normHost(r.domain ?? '')
        if (host) seenHosts.add(host)
      }
      const allSeen = [...targetHostsNorm].every((h) => seenHosts.has(h))
      if (allSeen) break
    }

    if (pageRows.length < PAGE_LIMIT) break
  }

  return rows
}

async function getPlacementCitationDatesImpl(
  clientSlug?: string,
  opts: { startDate?: string; endDate?: string; targetHosts?: string[] } = {},
): Promise<CitationDateIndex> {
  let pid: string | undefined
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
  } else {
    pid = process.env.PEEC_AI_PROJECT_ID
  }
  if (!pid) return {}

  const d = defaultWindow()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }
  const targetHostsNorm = new Set(
    (opts.targetHosts ?? []).map((h) => normHost(h)).filter((h): h is string => !!h),
  )

  const [ascRows, descRows] = await Promise.all([
    walkDomainDates(pid, window, targetHostsNorm, 'asc'),
    walkDomainDates(pid, window, targetHostsNorm, 'desc'),
  ])

  const asc = buildCitationDateIndex(ascRows)
  const desc = buildCitationDateIndex(descRows)
  return mergeAscDescIndexes(asc, desc)
}

export const getPlacementCitationDates = cached('peec', 'getPlacementCitationDates', getPlacementCitationDatesImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
