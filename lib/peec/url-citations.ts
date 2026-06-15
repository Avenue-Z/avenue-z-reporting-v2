// lib/peec/url-citations.ts
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'

const BASE_URL = 'https://api.peec.ai/customer/v1'

/** Map a Peec model_channel id (e.g. "openai-0") to a friendly engine label. */
function normalizeEngine(id: string): string | null {
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
  citationAvg: number              // average citation position (lower = better)
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
    if (!key || !r.model_channel?.id) continue
    const engine = normalizeEngine(r.model_channel.id)
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
 * Average citation position per domain, citation-count-weighted. URLs cited more
 * often weigh more heavily; a host whose URLs all have zero citations falls back
 * to a simple mean. Lower is better (position #1 = first cited).
 */
export function avgPositionByDomain(citations: UrlCitation[]): Record<string, number> {
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
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, limit: 1000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['model_channel_id'], limit: 2000 }, pid),
    post<{ data: ApiBrandNameRow[] }>('/reports/brands', { ...window, limit: 200 }, pid),
  ])
  const brandRows = brandsRes.data ?? []
  const yourBrandIds = resolveYourBrandIds(brandRows, yourBrand)
  const brandNameById = new Map(brandRows.map((b) => [b.brand.id, b.brand.name]))
  return mergeUrlCitations(baseRes.data ?? [], engineRes.data ?? [], yourBrandIds, brandNameById)
}

export const getUrlCitations = cached('peec', 'getUrlCitations', getUrlCitationsImpl, {
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
  /** host → distinct theme (tag) ids */
  tagIdsByDomain: Record<string, string[]>
  /** tag id → display name (from /tags), for resolving themes to Prompt Cluster labels */
  tagNameById: Record<string, string>
}

/** Normalize a bare domain (e.g. "www.Forbes.com") to match hostOf() output. */
function lookupHost(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, '')
}

/** Aggregate prompt/tag-dimensioned URL rows into per-domain id sets. */
export function aggregateDomainCoverage(
  promptRows: ApiUrlRow[],
  tagRows: ApiUrlRow[],
  tagNameById: Record<string, string> = {},
): DomainCoverage {
  const collect = (rows: ApiUrlRow[], idOf: (r: ApiUrlRow) => string | undefined) => {
    const sets = new Map<string, Set<string>>()
    for (const r of rows) {
      const id = idOf(r)
      if (!id) continue
      const host = hostOf(r.url)
      if (!host) continue
      if (!sets.has(host)) sets.set(host, new Set())
      sets.get(host)!.add(id)
    }
    return Object.fromEntries([...sets].map(([k, v]) => [k, [...v]]))
  }
  return {
    promptIdsByDomain: collect(promptRows, (r) => r.prompt?.id),
    tagIdsByDomain: collect(tagRows, (r) => r.tag?.id),
    tagNameById,
  }
}

/** Distinct tracked prompts in which any URL on `domain` is cited. */
export function domainPromptIds(cov: DomainCoverage, domain: string): string[] {
  return cov.promptIdsByDomain[lookupHost(domain)] ?? []
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

const EMPTY_COVERAGE: DomainCoverage = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagNameById: {} }

async function getDomainCoverageImpl(clientSlug?: string): Promise<DomainCoverage> {
  let pid: string | undefined
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    pid = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
  }
  if (!pid && !process.env.PEEC_AI_PROJECT_ID) return EMPTY_COVERAGE

  const window = last30()
  const [promptRes, tagRes, tagsRes] = await Promise.all([
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['prompt_id'], limit: 2000 }, pid),
    post<{ data: ApiUrlRow[] }>('/reports/urls', { ...window, dimensions: ['tag_id'], limit: 2000 }, pid),
    get<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
  ])
  const tagNameById = Object.fromEntries((tagsRes.data ?? []).map((t) => [t.id, t.name]))
  return aggregateDomainCoverage(promptRes.data ?? [], tagRes.data ?? [], tagNameById)
}

export const getDomainCoverage = cached('peec', 'getDomainCoverage', getDomainCoverageImpl, {
  version: 'v1',
  extractTags: ([slug]) => ({ client: slug ?? 'default' }),
})
