// lib/peec/url-citations.ts
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'

const BASE_URL = 'https://api.peec.ai/customer/v1'

/** Map a Peec model.id (e.g. "gemini-scraper") to a friendly engine label.
 *  FB-005: callers should pass `model.id` not `model_channel.id`. The channel id
 *  like "google-2" is the Gemini channel and would otherwise silently fall into
 *  the Google bucket via the "google" substring check. */
export function normalizeEngine(id: string): string | null {
  const s = id.toLowerCase()
  if (s.includes('openai') || s.includes('chatgpt')) return 'ChatGPT'
  if (s.includes('perplexity')) return 'Perplexity'
  if (s.includes('gemini')) return 'Gemini'
  if (s.includes('claude')) return 'Claude'
  if (s.includes('copilot')) return 'Copilot'
  if (s.includes('google')) return 'Google'
  return null
}

export type ApiUrlRow = {
  url: string
  classification: string
  title: string | null
  channel_title: string | null
  model_channel?: { id: string }
  model?: { id: string }
  prompt?: { id: string }
  tag?: { id: string }
  usage_count: number
  citation_count: number
  citation_avg: number
  retrievals: number
  retrieval_count: number
  citation_rate: number
  mentioned_brands: { id: string }[]
}

type ApiBrandNameRow = { brand: { id: string; name: string } }

export type UrlCitation = {
  url: string
  urlKey: string
  domain: string
  classification: string
  title: string | null
  citationCount: number
  citationRate: number
  citationAvg: number              // average citations per answer (Peec citation_avg)
  engines: string[]
  mentionedBrandIds: string[]
  competitorBrandNames: string[]   // mentioned brand names excluding "your brand"
  mentionsYourBrand: boolean
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() }
  catch { return (urlJoinKey(url) ?? '').split('/')[0] }
}

/** Match the configured "your brand" display name to its Peec brand id(s). */
export function resolveYourBrandIds(brands: ApiBrandNameRow[], yourBrand: string): string[] {
  const needle = yourBrand.trim().toLowerCase()
  if (!needle) return []
  return brands.filter((b) => b.brand?.name?.trim().toLowerCase() === needle).map((b) => b.brand.id)
}

/** Merge base URL rows with per-engine rows into typed citations. */
export function mergeUrlCitations(
  base: ApiUrlRow[],
  perEngine: ApiUrlRow[],
  yourBrandIds: string[],
  brandNameById: Map<string, string> = new Map(),
): UrlCitation[] {
  const enginesByKey = new Map<string, Set<string>>()
  for (const r of perEngine) {
    const key = urlJoinKey(r.url)
    // FB-005: prefer the friendly scraper id (model.id) over the channel id so
    // gemini-scraper rows aren't silently merged into the Google bucket.
    const rawModelId = r.model?.id ?? r.model_channel?.id
    if (!key || !rawModelId) continue
    const engine = normalizeEngine(rawModelId)
    if (!engine) continue
    if (!enginesByKey.has(key)) enginesByKey.set(key, new Set())
    enginesByKey.get(key)!.add(engine)
  }
  const yours = new Set(yourBrandIds)
  const out: UrlCitation[] = []
  for (const r of base) {
    const urlKey = urlJoinKey(r.url)
    if (!urlKey) continue
    const brandIds = (r.mentioned_brands ?? []).map((b) => b.id)
    const competitorBrandNames = brandIds
      .filter((id) => !yours.has(id))
      .map((id) => brandNameById.get(id))
      .filter((n): n is string => !!n)
    out.push({
      url: r.url,
      urlKey,
      domain: hostOf(r.url),
      classification: r.classification,
      title: r.title,
      citationCount: r.citation_count,
      citationRate: r.citation_rate,
      citationAvg: r.citation_avg,
      engines: Array.from(enginesByKey.get(urlKey) ?? []),
      mentionedBrandIds: brandIds,
      competitorBrandNames,
      mentionsYourBrand: brandIds.some((id) => yours.has(id)),
    })
  }
  return out
}

/**
 * Average citations-per-answer per domain (Peec `citation_avg`), citation-count
 * weighted. URLs cited more often weigh more heavily; a host whose URLs all have
 * zero citations falls back to a simple mean. Higher = cited more per answer.
 */
export function avgCitationsByDomain(citations: UrlCitation[]): Record<string, number> {
  const agg = new Map<string, { weighted: number; weight: number; sum: number; n: number }>()
  for (const c of citations) {
    const host = lookupHost(c.domain)
    if (!host) continue
    const e = agg.get(host) ?? { weighted: 0, weight: 0, sum: 0, n: 0 }
    e.weighted += c.citationAvg * c.citationCount
    e.weight += c.citationCount
    e.sum += c.citationAvg
    e.n += 1
    agg.set(host, e)
  }
  const out: Record<string, number> = {}
  for (const [host, e] of agg) {
    out[host] = e.weight > 0 ? e.weighted / e.weight : e.n > 0 ? e.sum / e.n : 0
  }
  return out
}

/**
 * PR-2 (Paul QA): "Top Editorial Opportunities" is titled and subtitled as
 * rows that are on the rise, so a row must actually be gaining citation share
 * period over period, not flat or declining. This is the pure predicate for
 * that gate: current and prior are citation-share percentages for the same
 * URL, and the row qualifies only when the delta is strictly greater than
 * zero. Delta exactly zero is excluded (flat is not rising).
 */
export function isPositiveDelta(currentShare: number, priorShare: number): boolean {
  return currentShare - priorShare > 0
}

function getKey(): string {
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  if (!key) throw new Error('Missing env var: PEEC_AI_CUSTOMER_TOKEN')
  return key
}

async function post<T>(path: string, body: Record<string, unknown>, pid?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(pid ? { project_id: pid } : {}), ...body }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  return res.json()
}

async function get<T>(path: string, params: Record<string, string>, pid?: string): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`)
  if (pid) url.searchParams.set('project_id', pid)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { 'X-API-Key': getKey() }, cache: 'no-store' })
  if (!res.ok) throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  return res.json()
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10) }
function last30() {
  const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 29)
  return { start_date: isoDate(start), end_date: isoDate(end) }
}

/**
 * FB-069: walk a paginated Peec list endpoint until a short page arrives.
 *
 * A single `limit: 2000` request returned 2,000 of Renaissance's 17,081 cited
 * URLs. Under the old domain-level matchback that mostly went unnoticed, because
 * a busy domain shows up early. Article-level matching needs the *exact* URL in
 * the result set, so anything truncated becomes a placement that silently reads
 * as "not cited". Bristol's dig-in.com placement was already being dropped this
 * way before the match rule changed.
 *
 * Bounded by maxPages so an unusually large account cannot spin unbounded
 * requests. Measured against Peec: per-request latency is flat across page
 * sizes (~1.2s at both 2,000 and 10,000 rows), so a large page is strictly
 * cheaper than many small ones.
 */
export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ rows: T[]; totalCount?: number }>,
  opts: { pageSize: number; maxPages: number; label?: string },
): Promise<T[]> {
  const out: T[] = []
  let reportedTotal: number | undefined

  // Review #10: disjoint pages prove `offset` is honoured, they do not prove the
  // union is the whole set. With a tie-heavy sort and no explicit order_by, a
  // reorder between requests can carry a row past the page boundary so it is
  // never returned, and the dedupe added for finding 6 is structurally blind to
  // that. Peec reports totalCount alongside data, so compare against it. One
  // assertion also catches an ignored offset, a mid-walk data shift, and a
  // silently changed page cap.
  const checkComplete = () => {
    if (reportedTotal == null || out.length === reportedTotal) return
    console.warn(
      `[peec] fetchAllPages${opts.label ? ` (${opts.label})` : ''}: got ${out.length} rows ` +
      `but the source reported ${reportedTotal} — RESULT IS INCOMPLETE`,
    )
  }

  for (let page = 0; page < opts.maxPages; page++) {
    const { rows, totalCount } = await fetchPage(page * opts.pageSize, opts.pageSize)
    if (page === 0) reportedTotal = totalCount
    out.push(...rows)
    if (rows.length < opts.pageSize) {   // short page: the source is exhausted
      checkComplete()
      return out
    }
  }
  // Ran out of pages with every page full, so the source had more than we read.
  // Silent truncation is the exact failure this whole change exists to remove,
  // so it must not be indistinguishable from "the data ran out".
  console.warn(
    `[peec] fetchAllPages${opts.label ? ` (${opts.label})` : ''}: hit maxPages=${opts.maxPages} ` +
    `at pageSize=${opts.pageSize}, returning ${out.length} rows — RESULT IS TRUNCATED`,
  )
  return out
}

/**
 * Count repeated urlKeys across a walked citation set.
 *
 * Review #10: offset pagination is only complete if the server's ordering is
 * stable between requests. Disjoint pages prove `offset` is honoured, not that
 * the union is the whole set: a mid-walk reorder can carry a row past the page
 * boundary so it is never returned.
 *
 * Measured against Peec, neither suggested check is available here. /reports/urls
 * returns no totalCount (only `data`), and order_by on `url` is rejected with a
 * 400 -- the sole accepted sort field is `citation_count`, which is the tie-heavy
 * field the concern is about, so it adds no determinism.
 *
 * What IS observable: a reorder that pushes some rows forward past the boundary
 * pulls others backward across it. Within a single complete walk every base row
 * is a distinct URL, so any repeated urlKey means the ordering shifted underneath
 * us, which implies rows may also have been lost. Not a proof of completeness,
 * but it turns a silent class of failure into a loud one.
 */
export function countDuplicateUrlKeys(citations: Pick<UrlCitation, 'urlKey'>[]): number {
  const seen = new Set<string>()
  let duplicates = 0
  for (const c of citations) {
    if (seen.has(c.urlKey)) duplicates++
    else seen.add(c.urlKey)
  }
  return duplicates
}

/**
 * Keep only the citations matching a specific set of URL keys, deduped.
 *
 * The PR-placement matchback needs the whole cited-URL set to answer a question
 * about ~12 URLs. Filtering server-side keeps the cached value proportional to
 * the placement count rather than the citation count, so it stays kilobytes
 * regardless of how large the account grows.
 *
 * Dedupe is deliberate: nothing downstream of a paginated fetch guarantees a row
 * appears once, and duplicates would otherwise reach consumers that sum values.
 * Engines are unioned rather than overwritten so a URL split across pages keeps
 * every engine that cited it.
 */
export function pickCitationsForUrls(citations: UrlCitation[], urlKeys: string[]): UrlCitation[] {
  if (urlKeys.length === 0) return []
  const wanted = new Set(urlKeys)
  const byKey = new Map<string, UrlCitation>()
  for (const c of citations) {
    if (!wanted.has(c.urlKey)) continue
    const seen = byKey.get(c.urlKey)
    if (!seen) {
      byKey.set(c.urlKey, { ...c, engines: [...c.engines] })
      continue
    }
    for (const e of c.engines) if (!seen.engines.includes(e)) seen.engines.push(e)
  }
  return [...byKey.values()]
}


async function getUrlCitationsImpl(
  clientSlug?: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<UrlCitation[]> {
  let pid: string | undefined
  let yourBrand = ''
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
    yourBrand = config?.peecYourBrand ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return []

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }

  const [baseRes, engineRes, brandsRes] = await Promise.all([
    // FB-058: base URL fetch raised 1000 -> 2000 so owned cited pages ranked below
    // the top 1000 most-cited URLs (across all domains) are not truncated before the
    // §F owned-host filter runs. Matches the engine fetch limit below.
    //
    // FB-069 deliberately leaves this capped. The PR-placement matchback is the
    // only consumer that needs every cited URL, and it now has its own narrow
    // fetch (getPlacementCitations) rather than widening this shared one. At
    // Renaissance's 17,081 URLs an uncapped result is ~7.6 MB, which exceeds
    // Next's 2 MB data-cache limit and would silently stop caching for all five
    // call sites across three tabs (same failure as #138 P9).
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, limit: 2000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    post<{ data: ApiBrandNameRow[] }>('/reports/brands', { ...window, limit: 200 }, pid),
  ])
  const brandRows = brandsRes.data ?? []
  const yourBrandIds = resolveYourBrandIds(brandRows, yourBrand)
  const brandNameById = new Map(brandRows.map((b) => [b.brand.id, b.brand.name]))
  return mergeUrlCitations(baseRes.data ?? [], engineRes.data ?? [], yourBrandIds, brandNameById)
}

export const getUrlCitations = cached('peec', 'getUrlCitations', getUrlCitationsImpl, {
  version: 'v3',  // v3: dateRange opts surfaced to callers (FB-035). FB-069 deliberately did NOT bump this: this fetch is unchanged, so existing cache entries stay valid.
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})

// ── FB-069: citations for a specific set of PR placements ────────────────────
// Narrow companion to getUrlCitations, for the PR-placement matchback only.
//
// The matchback asks a small question ("were these ~12 article URLs cited?") of a
// large data set (17,081 URLs for Renaissance). getUrlCitations is capped at
// 2,000 rows and shared by three tabs, so it cannot answer that question, and
// uncapping it would push its cached payload to ~7.6 MB — past Next's 2 MB limit,
// silently disabling the cache for every consumer. So this walks every page and
// returns only the matching rows: a few hundred bytes, and proportional to the
// placement count rather than the citation count.
//
// Blast radius is exactly one table. No existing caller changes.

/** Peec accepts 10,000 per page on /reports/urls at flat latency (~1.2s at both
 *  2,000 and 10,000), so a large page is strictly cheaper than many small ones. */
const CITATION_PAGE_SIZE = 10_000
/** 120,000-row ceiling. Measured today: base query 17,081 rows, engine query
 *  19,005 — about 6x headroom. fetchAllPages warns loudly if it is ever hit. */
const CITATION_MAX_PAGES = 12

async function getPlacementCitationsImpl(
  clientSlug: string | undefined,
  placementUrlKeys: string[],
  opts: { startDate?: string; endDate?: string } = {},
): Promise<UrlCitation[]> {
  if (placementUrlKeys.length === 0) return []

  let pid: string | undefined
  let yourBrand = ''
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
    yourBrand = config?.peecYourBrand ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return []

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }

  const [baseRows, engineRows, brandsRes] = await Promise.all([
    fetchAllPages(
      (offset, limit) =>
        // Review #10: Peec returns totalCount alongside data (already typed and
        // used on other endpoints in lib/peec/client.ts). Threading it lets
        // fetchAllPages assert the walk was complete, not merely non-overlapping.
        post<{ data: ApiUrlRow[]; totalCount?: number }>('/reports/urls', { ...window, limit, offset }, pid)
          .then((r) => ({ rows: r.data ?? [], totalCount: r.totalCount })),
      { pageSize: CITATION_PAGE_SIZE, maxPages: CITATION_MAX_PAGES, label: 'placement citations (base)' },
    ),
    fetchAllPages(
      (offset, limit) =>
        post<{ data: ApiUrlRow[]; totalCount?: number }>(
          '/reports/urls',
          { ...window, dimensions: ['model_channel_id', 'model_id'], limit, offset },
          pid,
        ).then((r) => ({ rows: r.data ?? [], totalCount: r.totalCount })),
      { pageSize: CITATION_PAGE_SIZE, maxPages: CITATION_MAX_PAGES, label: 'placement citations (engines)' },
    ),
    post<{ data: ApiBrandNameRow[] }>('/reports/brands', { ...window, limit: 200 }, pid),
  ])
  const brandRows = brandsRes.data ?? []
  const yourBrandIds = resolveYourBrandIds(brandRows, yourBrand)
  const brandNameById = new Map(brandRows.map((b) => [b.brand.id, b.brand.name]))
  const merged = mergeUrlCitations(baseRows, engineRows, yourBrandIds, brandNameById)

  // Review #10: a repeated urlKey inside one walk means the source reordered
  // mid-pagination, which implies rows may also have been dropped past a page
  // boundary. pickCitationsForUrls collapses duplicates, so without this the
  // anomaly would be silently absorbed.
  const duplicates = countDuplicateUrlKeys(merged)
  if (duplicates > 0) {
    console.warn(
      `[peec] getPlacementCitations(${clientSlug ?? 'default'}): ${duplicates} duplicate urlKey(s) ` +
      `across ${merged.length} walked rows — pagination reordered mid-walk, result MAY BE INCOMPLETE`,
    )
  }

  return pickCitationsForUrls(merged, placementUrlKeys)
}

export const getPlacementCitations = cached('peec', 'getPlacementCitations', getPlacementCitationsImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})

// ── Domain → prompt / theme coverage ────────────────────────────────────────
// Which tracked prompts and which themes (tags) each cited *domain* appears in.
// Derived from per-URL citation rows dimensioned by prompt_id / tag_id, then
// aggregated by host. This replaces the earlier (broken) approach that compared
// domain names against trackedPrompts[].sources — sources are AI-engine ids
// (e.g. "ChatGPT"), never domains, so coverage was always 0.

export type DomainCoverage = {
  /** host (lowercased, www-stripped) → distinct prompt ids citing a URL on that host */
  promptIdsByDomain: Record<string, string[]>
  /**
   * host → engine label (normalizeEngine output, e.g. "ChatGPT") → distinct
   * prompt ids citing a URL on that host via that engine. CI-1: lets the
   * Content Impact "Prompt Coverage" KPI value react to the model filter, not
   * just its delta pill. Optional so hand-built fallback/empty DomainCoverage
   * literals elsewhere (other consumers' rejected-fetch placeholders) do not
   * need updating: treat a missing entry the same as "no citations for that
   * host under any engine."
   */
  promptIdsByDomainByModel?: Record<string, Record<string, string[]>>
  /** host → distinct theme (tag) ids */
  tagIdsByDomain: Record<string, string[]>
  /** url join key → distinct theme (tag) ids citing that specific URL (Section H.3) */
  tagIdsByUrlKey: Record<string, string[]>
  /** url join key → distinct prompt ids citing that specific URL (Section B, FB-035) */
  promptIdsByUrlKey: Record<string, string[]>
  /** tag id → display name (from /tags), for resolving themes to Prompt Cluster labels */
  tagNameById: Record<string, string>
}

/** Normalize a bare domain (e.g. "www.Forbes.com") to match hostOf() output. */
function lookupHost(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '')
}

/**
 * Aggregate prompt/tag-dimensioned URL rows into per-domain id sets.
 *
 * CI-1: `promptRows` may also carry `model.id` (fetch dimensions
 * `['prompt_id','model_id']`); when present, an additional model-aware
 * structure is derived alongside the existing all-engines one so the
 * Content Impact "Prompt Coverage" KPI value can be filtered by the selected
 * AI model(s), not just its delta pill.
 */
export function aggregateDomainCoverage(
  promptRows: ApiUrlRow[],
  tagRows: ApiUrlRow[],
  tagNameById: Record<string, string> = {},
): DomainCoverage {
  const collect = (
    rows: ApiUrlRow[],
    idOf: (r: ApiUrlRow) => string | undefined,
    keyOf: (r: ApiUrlRow) => string | null,
  ) => {
    const sets = new Map<string, Set<string>>()
    for (const r of rows) {
      const id = idOf(r)
      if (!id) continue
      const key = keyOf(r)
      if (!key) continue
      if (!sets.has(key)) sets.set(key, new Set())
      sets.get(key)!.add(id)
    }
    return Object.fromEntries([...sets].map(([k, v]) => [k, [...v]]))
  }

  // host -> engine label -> distinct prompt ids. Rows without a resolvable
  // model.id (or an unmapped scraper id) are simply skipped here; they still
  // count toward the all-engines promptIdsByDomain below.
  const byDomainByModel = new Map<string, Map<string, Set<string>>>()
  for (const r of promptRows) {
    const promptId = r.prompt?.id
    if (!promptId) continue
    const host = hostOf(r.url)
    if (!host) continue
    const rawModelId = r.model?.id ?? r.model_channel?.id
    if (!rawModelId) continue
    const engine = normalizeEngine(rawModelId)
    if (!engine) continue
    if (!byDomainByModel.has(host)) byDomainByModel.set(host, new Map())
    const byModel = byDomainByModel.get(host)!
    if (!byModel.has(engine)) byModel.set(engine, new Set())
    byModel.get(engine)!.add(promptId)
  }
  const promptIdsByDomainByModel: Record<string, Record<string, string[]>> = {}
  for (const [host, byModel] of byDomainByModel) {
    promptIdsByDomainByModel[host] = Object.fromEntries(
      [...byModel].map(([engine, ids]) => [engine, [...ids]]),
    )
  }

  return {
    promptIdsByDomain: collect(promptRows, (r) => r.prompt?.id, (r) => hostOf(r.url) || null),
    promptIdsByDomainByModel,
    tagIdsByDomain: collect(tagRows, (r) => r.tag?.id, (r) => hostOf(r.url) || null),
    tagIdsByUrlKey: collect(tagRows, (r) => r.tag?.id, (r) => urlJoinKey(r.url)),
    promptIdsByUrlKey: collect(promptRows, (r) => r.prompt?.id, (r) => urlJoinKey(r.url)),
    tagNameById,
  }
}

/** Distinct tracked prompts in which any URL on `domain` is cited. */
export function domainPromptIds(cov: DomainCoverage, domain: string): string[] {
  return cov.promptIdsByDomain[lookupHost(domain)] ?? []
}

/**
 * Section A "Prompt Coverage" KPI: percent of tracked prompts that cite at
 * least one URL on an owned domain. Prompt ids are unioned across all owned
 * domains (a prompt citing two owned domains counts once). Returns null when
 * coverage data is unavailable or there are no tracked prompts, so callers can
 * tell "missing data" apart from a real 0. Shared by the current and prior
 * periods so the card's period-over-period delta uses one definition.
 */
export function ownedPromptCoveragePct(
  cov: DomainCoverage,
  ownedDomains: string[],
  totalTrackedPrompts: number,
  available: boolean,
): number | null {
  if (!available || totalTrackedPrompts <= 0) return null
  const ids = new Set<string>()
  for (const d of ownedDomains) {
    for (const pid of domainPromptIds(cov, d)) ids.add(pid)
  }
  return Math.round((ids.size / totalTrackedPrompts) * 100)
}

/**
 * Model-aware variant of `ownedPromptCoveragePct` (CI-1). Same contract, plus
 * a `models` filter: when `models` is null or empty ("all models" / no filter),
 * this returns exactly the same value as `ownedPromptCoveragePct` (union across
 * all engines, via `promptIdsByDomain`). When one or more engines are selected,
 * prompt ids are unioned only across owned domains AND only for citations
 * attributed to a selected engine (via `promptIdsByDomainByModel`), so the
 * Content Impact "Prompt Coverage" KPI value moves with the model filter, not
 * just its period-over-period delta.
 */
export function ownedPromptCoveragePctForModels(
  cov: DomainCoverage,
  ownedDomains: string[],
  totalTrackedPrompts: number,
  models: string[] | null | undefined,
  available: boolean,
): number | null {
  if (!available || totalTrackedPrompts <= 0) return null
  const ids = new Set<string>()
  if (!models || models.length === 0) {
    for (const d of ownedDomains) {
      for (const pid of domainPromptIds(cov, d)) ids.add(pid)
    }
  } else {
    for (const d of ownedDomains) {
      const byModel = cov.promptIdsByDomainByModel?.[lookupHost(d)] ?? {}
      for (const m of models) {
        for (const pid of byModel[m] ?? []) ids.add(pid)
      }
    }
  }
  return Math.round((ids.size / totalTrackedPrompts) * 100)
}

/** Distinct themes (tags) in which any URL on `domain` is cited. */
export function domainTagIds(cov: DomainCoverage, domain: string): string[] {
  return cov.tagIdsByDomain[lookupHost(domain)] ?? []
}

/** Theme display names (Prompt Clusters) for `domain`, dropping ids with no name. */
export function domainTagNames(cov: DomainCoverage, domain: string): string[] {
  return domainTagIds(cov, domain)
    .map((id) => cov.tagNameById[id])
    .filter((n): n is string => !!n)
}

/** Theme display names for a specific URL (by join key), dropping ids with no name. */
export function urlTagNames(cov: DomainCoverage, urlKey: string): string[] {
  return (cov.tagIdsByUrlKey[urlKey] ?? [])
    .map((id) => cov.tagNameById[id])
    .filter((n): n is string => !!n)
}

/** Distinct prompt ids citing a specific URL (by join key). */
export function urlPromptIds(cov: DomainCoverage, urlKey: string): string[] {
  return cov.promptIdsByUrlKey[urlKey] ?? []
}

const EMPTY_COVERAGE: DomainCoverage = {
  promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {},
  promptIdsByUrlKey: {}, tagNameById: {},
}

async function getDomainCoverageImpl(
  clientSlug?: string,
  opts: { startDate?: string; endDate?: string } = {},
): Promise<DomainCoverage> {
  let pid: string | undefined
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return EMPTY_COVERAGE

  const d = last30()
  const window = { start_date: opts.startDate ?? d.start_date, end_date: opts.endDate ?? d.end_date }
  const [promptRes, tagRes, tagsRes] = await Promise.all([
    // CI-1: dimensioned by prompt_id AND model_id so promptIdsByDomainByModel
    // can be derived (Content Impact "Prompt Coverage" KPI value reacting to
    // the model filter). Adding a second dimension multiplies row count (up to
    // ~6x, one row per prompt per engine instead of one per prompt), so the
    // limit is raised from 2000 to 10000 to match the precedent for other
    // prompt_id + model dimensioned fetches (lib/peec/client.ts:437) and avoid
    // silently truncating owned-domain prompt rows.
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['prompt_id', 'model_id'], limit: 10000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['tag_id'], limit: 2000 }, pid),
    get<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
  ])
  const tagNameById = Object.fromEntries((tagsRes.data ?? []).map((t) => [t.id, t.name]))
  return aggregateDomainCoverage(promptRes.data ?? [], tagRes.data ?? [], tagNameById)
}

export const getDomainCoverage = cached('peec', 'getDomainCoverage', getDomainCoverageImpl, {
  // v5: prompt-coverage fetch now dimensioned by prompt_id + model_id (was
  // prompt_id only), adding promptIdsByDomainByModel to the response shape
  // and raising the fetch limit 2000 -> 10000 (CI-1).
  version: 'v5',
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
