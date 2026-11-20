// lib/peec/coverage-projection.ts
// Complete prompt×model coverage, walked to the end and cached as a small
// projection. The full aggregate is ~5.75 MB for Renaissance (over Next's 2 MB
// data-cache limit), so only what Content Impact and the Overview competitor
// parts read is kept (~0.86 MB). `getDomainCoverage` is deliberately untouched:
// PR Influence reads it for arbitrary domains.
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'
import { isOwnedHost, ownedHostKeys } from './owned-hosts'
import { isBrandAbsent } from './competitor-tables'
import {
  aggregateDomainCoverage, fetchAllPagesChecked, walkWithD21Retry, get, getUrlCitations, hostOf, last30,
  normalizeEngine, post, resolveYourBrandIds, CITATION_MAX_PAGES, CITATION_PAGE_SIZE,
  type ApiUrlRow, type DomainCoverage, type UrlCitation,
} from './url-citations'

export type OtherSite = { urlKey: string; url: string; citationCount: number; namesCompetitor: boolean }

export type CoverageProjection = DomainCoverage & {
  complete: boolean
  duplicateRows: number
  ownedPromptIds: string[]
  ownedPromptIdsByModel: Record<string, string[]>
  otherSitesByPrompt: Record<string, { urls: OtherSite[]; more: number }>
}

export const EMPTY_COVERAGE_PROJECTION: CoverageProjection = {
  promptIdsByDomain: {}, promptIdsByDomainByModel: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {},
  promptIdsByUrlKey: {}, tagNameById: {},
  complete: true, duplicateRows: 0,
  ownedPromptIds: [], ownedPromptIdsByModel: {}, otherSitesByPrompt: {},
}

const TOP_OTHER_SITES = 3

/** Gap-table urls whose prompt ids the projection keeps. H2 renders the top 10; 50 leaves headroom (M7). */
export const GAP_URL_KEYS_LIMIT = 50
/** Warn well before Next's 2 MB data-cache limit (FB-069), so growth is seen before caching silently stops. */
export const PROJECTION_WARN_BYTES = 1_500_000

/** Usable for a coverage number: a complete walk (D-21) that returned some data (else `--`). */
export function coverageAvailable(c: CoverageProjection): boolean {
  return c.complete && (Object.keys(c.promptIdsByDomain).length > 0 || Object.keys(c.tagIdsByDomain).length > 0)
}

/**
 * The gap table's candidate urls: brand-absent, competitor-naming, top GAP_URL_KEYS_LIMIT by
 * citations. Same filter and order as buildBrandAbsentRows, so its top 10 are always inside.
 */
export function topGapUrlKeys(citations: UrlCitation[]): Set<string> {
  return new Set(
    citations.filter(isBrandAbsent)
      .sort((a, b) => b.citationCount - a.citationCount)
      .slice(0, GAP_URL_KEYS_LIMIT)
      .map((c) => c.urlKey),
  )
}

export function warnIfProjectionLarge(p: CoverageProjection, label: string): void {
  const bytes = JSON.stringify(p).length
  if (bytes > PROJECTION_WARN_BYTES) {
    console.warn(`[coverage-projection] ${label}: projection is ${bytes} bytes, near Next's 2 MB cache limit`)
  }
}

function pick<T>(o: Record<string, T> | undefined, keep: (k: string) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => keep(k)))
}

/** Pure projection of the walked rows; all logic lives here so it needs no HTTP. */
export function projectCoverage(input: {
  promptRows: ApiUrlRow[]
  tagRows: ApiUrlRow[]
  tagNameById: Record<string, string>
  ownedHosts: Set<string>
  competitorDomains: Set<string>
  gapUrlKeys: Set<string>
  yourBrandIds: string[]
  complete: boolean
  duplicateRows: number
}): CoverageProjection {
  const { promptRows, ownedHosts, competitorDomains, gapUrlKeys } = input
  const full = aggregateDomainCoverage(promptRows, input.tagRows, input.tagNameById)
  const keepHost = (h: string) => isOwnedHost(h, ownedHosts) || competitorDomains.has(h)

  const yours = new Set(input.yourBrandIds)
  const ownedUrlKeys = new Set<string>()
  const ownedAll = new Set<string>()
  const ownedByModel = new Map<string, Set<string>>()
  const others = new Map<string, Map<string, OtherSite>>()

  for (const r of promptRows) {
    const promptId = r.prompt?.id
    const urlKey = urlJoinKey(r.url)
    if (!promptId || !urlKey) continue
    if (isOwnedHost(hostOf(r.url), ownedHosts)) {
      ownedUrlKeys.add(urlKey)
      ownedAll.add(promptId)
      const engine = normalizeEngine(r.model?.id ?? r.model_channel?.id ?? '')
      if (engine) {
        if (!ownedByModel.has(engine)) ownedByModel.set(engine, new Set())
        ownedByModel.get(engine)!.add(promptId)
      }
      continue
    }
    const names = (r.mentioned_brands ?? []).some((b) => !yours.has(b.id))
    if (!others.has(promptId)) others.set(promptId, new Map())
    const sites = others.get(promptId)!
    const site = sites.get(urlKey) ?? { urlKey, url: r.url, citationCount: 0, namesCompetitor: false }
    site.citationCount += r.citation_count ?? 0
    site.namesCompetitor ||= names
    sites.set(urlKey, site)
  }

  const otherSitesByPrompt: CoverageProjection['otherSitesByPrompt'] = {}
  for (const [promptId, sites] of others) {
    const ranked = [...sites.values()].sort((a, b) =>
      Number(b.namesCompetitor) - Number(a.namesCompetitor)
      || b.citationCount - a.citationCount
      || a.urlKey.localeCompare(b.urlKey))
    otherSitesByPrompt[promptId] = {
      urls: ranked.slice(0, TOP_OTHER_SITES),
      more: Math.max(0, ranked.length - TOP_OTHER_SITES),
    }
  }

  return {
    promptIdsByDomain: pick(full.promptIdsByDomain, keepHost),
    promptIdsByDomainByModel: pick(full.promptIdsByDomainByModel, keepHost),
    promptIdsByUrlKey: pick(full.promptIdsByUrlKey, (k) => ownedUrlKeys.has(k) || gapUrlKeys.has(k)),
    tagIdsByDomain: full.tagIdsByDomain,
    tagIdsByUrlKey: full.tagIdsByUrlKey,
    tagNameById: full.tagNameById,
    complete: input.complete,
    duplicateRows: input.duplicateRows,
    ownedPromptIds: [...ownedAll],
    ownedPromptIdsByModel: Object.fromEntries([...ownedByModel].map(([m, ids]) => [m, [...ids]])),
    otherSitesByPrompt,
  }
}

type ApiDomainClass = { domain: string; classification: string }

async function getCoverageProjectionImpl(
  clientSlug: string | undefined,
  opts: { startDate: string; endDate: string },
): Promise<CoverageProjection> {
  let pid: string | undefined
  let yourBrand = ''
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
    yourBrand = config?.peecYourBrand ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return EMPTY_COVERAGE_PROJECTION

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }

  const walk = () => fetchAllPagesChecked<ApiUrlRow>(
    (offset, limit) =>
      post<{ data: ApiUrlRow[]; totalCount?: number }>(
        '/reports/urls', { ...window, dimensions: ['prompt_id', 'model_id'], limit, offset }, pid,
      ).then((r) => ({ rows: r.data ?? [], totalCount: r.totalCount })),
    {
      pageSize: CITATION_PAGE_SIZE,
      maxPages: CITATION_MAX_PAGES,
      label: 'coverage projection (prompt×model)',
      rowKey: (r) => `${r.url}|${r.prompt?.id}|${r.model?.id}`,
    },
  )

  const [promptWalk, tagRes, tagsRes, domainsRes, brandsRes, citations] = await Promise.all([
    walkWithD21Retry(walk, `getCoverageProjection(${clientSlug ?? 'default'})`),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['tag_id'], limit: 2000 }, pid),
    get<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
    post<{ data: ApiDomainClass[] }>('/reports/domains', { ...window, limit: 5000 }, pid),
    post<{ data: { brand: { id: string; name: string } }[] }>('/reports/brands', { ...window, limit: 200 }, pid),
    // D-10: the gap table renders getUrlCitations(clientSlug) (fixed last-30), so its
    // keys must come from that same call, not the picker window.
    getUrlCitations(clientSlug),
  ])

  const domains = domainsRes.data ?? []
  const byClass = (c: string) => domains.filter((x) => x.classification?.toUpperCase() === c)
  const competitorDomains = new Set(
    byClass('COMPETITOR').map((x) => urlJoinKey(x.domain)).filter((k): k is string => k !== null),
  )

  const projection = projectCoverage({
    promptRows: promptWalk.rows,
    tagRows: tagRes.data ?? [],
    tagNameById: Object.fromEntries((tagsRes.data ?? []).map((t) => [t.id, t.name])),
    ownedHosts: ownedHostKeys(byClass('OWN')),
    competitorDomains,
    // The gap table's rows (D-10 window): brand-absent URLs that name a competitor, top 50 (M7).
    gapUrlKeys: topGapUrlKeys(citations),
    yourBrandIds: resolveYourBrandIds(brandsRes.data ?? [], yourBrand),
    complete: promptWalk.complete,
    duplicateRows: promptWalk.duplicateRows,
  })
  warnIfProjectionLarge(projection, `getCoverageProjection(${clientSlug ?? 'default'})`)
  return projection
}

const getCoverageProjectionCached = cached('peec', 'getCoverageProjection', getCoverageProjectionImpl, {
  version: 'v2', // v2: promptIdsByUrlKey keeps only the top 50 gap urls (M7), not every brand-absent url

  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})

// I1: unstable_cache doesn't dedupe concurrent cold misses, and the Overview's two competitor
// parts ask for the same window at once, so each would run its own full walk. Share one
// promise per (client, window) while it's in flight; cleared when it settles.
const inFlight = new Map<string, Promise<CoverageProjection>>()

export function getCoverageProjection(
  clientSlug: string | undefined,
  opts: { startDate: string; endDate: string },
): Promise<CoverageProjection> {
  const key = JSON.stringify([clientSlug, opts.startDate, opts.endDate])
  const pending = inFlight.get(key)
  if (pending) return pending
  const p = getCoverageProjectionCached(clientSlug, opts).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}
