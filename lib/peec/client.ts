import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { AEOModel } from './models'
import type { ByModel } from './by-model'
import { citationTotalsByModel } from './by-model'
import type { DailyPoint, PeriodChange, TopicSource } from '@/lib/aeo/types'
import { buildPeriodChange } from '@/lib/aeo/period-change'
import { urlJoinKey } from '@/lib/url'

const BASE_URL = 'https://api.peec.ai/customer/v1'

function getKey(): string {
  // The customer (skc-) token works across all customer projects in our Peec
  // workspace, so the per-client peecCustomerProjectId we pass in the request
  // body is honored. The legacy PEEC_AI_ACCESS_TOKEN was scoped to a single
  // project (Avenue Z), which caused Renaissance requests to silently return
  // Avenue Z data — the API ignored the project_id when the token couldn't
  // access it.
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  if (!key) throw new Error('Missing env var: PEEC_AI_CUSTOMER_TOKEN')
  return key
}

// projectId: when provided, overrides PEEC_AI_PROJECT_ID env var (multi-client support)
async function peecPost<T>(
  path: string,
  body: Record<string, unknown> = {},
  projectId?: string
): Promise<T> {
  const pid = projectId ?? process.env.PEEC_AI_PROJECT_ID
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': getKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(pid ? { project_id: pid } : {}),
      limit: 100,
      ...body,
    }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[peec] ${res.status} ${path}:`, text)
    throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  }
  return res.json()
}

async function peecGet<T>(
  path: string,
  params: Record<string, string> = {},
  projectId?: string
): Promise<T> {
  const pid = projectId ?? process.env.PEEC_AI_PROJECT_ID
  const url = new URL(`${BASE_URL}${path}`)
  if (pid) url.searchParams.set('project_id', pid)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': getKey() },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Peec.AI API error ${res.status}: ${path}`)
  return res.json()
}

// --- Raw API response types ---

type ApiBrandRow = {
  brand: { id: string; name: string }
  date?: string
  prompt_id?: number | string
  prompt?: { id: number | string; text?: string; index?: number }
  model_channel?: { id: string }
  model?: { id: string }
  visibility: number
  visibility_count: number
  visibility_total: number
  share_of_voice: number
  sentiment: number
  sentiment_sum: number
  sentiment_count: number
  position: number
  position_sum: number
  position_count: number
  mention_count: number
}

type ApiDomainRow = {
  domain: string
  classification: string
  model_channel?: { id: string }
  model?: { id: string }
  retrieved_percentage: number
  citation_rate: number
  retrieval_count: number
  citation_count: number
  retrieved_chat_count: number
  total_chat_count: number
}

type ApiQueryRow = {
  query: { index: number; text: string }
  prompt?: { id: string; text?: string }
  chat: { id: string }
  model: { id: string }
  model_channel: { id: string }
  date: string
}

// --- Exported types ---

export type WeeklyVisibility = {
  weekStart: string
  weekLabel: string
  visibility: number
}

export type BrandRanking = {
  rank: number
  name: string
  visibility: number
  visibilityDelta: number
  sov: number
  sovDelta: number
  sentiment: number
  sentimentDelta: number
  position: number
  positionDelta: number
  isYou?: boolean
}

export type TopDomain = {
  domain: string
  retrieved: number
  retrievedDelta: number
  citationRate: number
  citationRateDelta: number
  citationCount: number  // Peec citation_count (raw integer), used for share-of-period math
  type: string
}

export type DomainType = {
  type: string
  percentage: number
}

export type LLMBreakdown = {
  model: string
  visibility: number
  sov: number
  position: number
  ownDomainRetrieved: number
}

export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  /** FB-023: per-model average rank position in the SELECTED period.
   *  Empty when this prompt was not surfaced by any tracked model in the
   *  current period. Used to apply the active model filter on the
   *  Winners/Losers compute before sorting. */
  positionByModel: Partial<Record<AEOModel, number>>
  /** FB-023: per-model average rank position in the IMMEDIATELY-PRECEDING
   *  period of equal length. Empty when this prompt was not tracked at
   *  all in the prior period. Used for delta vs prior period in
   *  Biggest Winners / Biggest Losers. */
  priorPositionByModel: Partial<Record<AEOModel, number>>
  group: string
  topicSource: TopicSource
}

export type CompetitorAverages = {
  visibility: number
  sov: number
  sentiment: number
  position: number
}

export type PeecOverview = {
  weeklyVisibility: WeeklyVisibility[]
  competitorWeeklyVisibility: WeeklyVisibility[]
  dailyVisibility: DailyPoint[]
  competitorDailyVisibility: DailyPoint[]
  competitorAverages: CompetitorAverages
  brandRankings: BrandRanking[]
  topDomains: TopDomain[]
  totalCitations: number
  // Citations attributed to the client's own domain (normalized host match
  // against clients.domain). Used to compute Citation Share % on the Overview.
  yourBrandCitations: number
  yourBrandCitationsPrior: number
  totalCitationsPrior: number
  domainTypes: DomainType[]
  trackedPrompts: TrackedPrompt[]
  llmBreakdown: LLMBreakdown[]
  /** Per-domain citation counts broken out by AI model. Built from the per-model
   *  domain fetch already done for llmBreakdown. */
  domainCitationsByModel: ByModel<string, number>
  /** Per-brand visibility scores broken out by AI model. */
  brandVisibilityByModel: ByModel<string, number>
  /** Per-model citation totals across all tracked domains, and per-model
   *  citations to the client's own domain. Used for model-filtered Citation
   *  Share on the Overview. */
  totalCitationsByModel: Partial<Record<AEOModel, number>>
  yourBrandCitationsByModel: Partial<Record<AEOModel, number>>
  periodChange: PeriodChange
}

// --- Aggregation helpers ---

function normalizeClassification(c: string | null | undefined): string {
  switch ((c ?? '').toLowerCase()) {
    case 'own':           return 'Own'
    case 'ugc':           return 'UGC'
    case 'editorial':     return 'Editorial'
    case 'corporate':     return 'Corporate'
    case 'competitor':    return 'Competitor'
    case 'reference':     return 'Reference'
    case 'institutional': return 'Institutional'
    default:              return c ?? 'Other'
  }
}

type BrandAgg = {
  name: string
  visCount: number
  visTotal: number
  sovSum: number
  sovRows: number
  sentSum: number
  sentCount: number
  posSum: number
  posCount: number
}

function aggregateBrandRows(rows: ApiBrandRow[]): Map<string, BrandAgg> {
  const map = new Map<string, BrandAgg>()
  for (const row of rows) {
    const key = row.brand.id
    const existing = map.get(key)
    if (existing) {
      existing.visCount += row.visibility_count
      existing.visTotal += row.visibility_total
      existing.sovSum += row.share_of_voice
      existing.sovRows += 1
      existing.sentSum += row.sentiment_sum
      existing.sentCount += row.sentiment_count
      existing.posSum += row.position_sum
      existing.posCount += row.position_count
    } else {
      map.set(key, {
        name: row.brand.name,
        visCount: row.visibility_count,
        visTotal: row.visibility_total,
        sovSum: row.share_of_voice,
        sovRows: 1,
        sentSum: row.sentiment_sum,
        sentCount: row.sentiment_count,
        posSum: row.position_sum,
        posCount: row.position_count,
      })
    }
  }
  return map
}

function aggToMetrics(agg: BrandAgg) {
  return {
    visibility: agg.visTotal > 0 ? (agg.visCount / agg.visTotal) * 100 : 0,
    sov: agg.sovRows > 0 ? (agg.sovSum / agg.sovRows) * 100 : 0,
    sentiment: agg.sentCount > 0 ? agg.sentSum / agg.sentCount : 0,
    position: agg.posCount > 0 ? agg.posSum / agg.posCount : 0,
  }
}

// --- Weekly grouping helper ---

function groupByWeek(rows: ApiBrandRow[]): WeeklyVisibility[] {
  const weekMap = new Map<string, { visCount: number; visTotal: number }>()
  for (const row of rows) {
    if (!row.date) continue
    const date = new Date(row.date)
    const day = date.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(date)
    monday.setUTCDate(date.getUTCDate() + diff)
    const key = monday.toISOString().split('T')[0]
    const existing = weekMap.get(key)
    if (existing) {
      existing.visCount += row.visibility_count
      existing.visTotal += row.visibility_total
    } else {
      weekMap.set(key, { visCount: row.visibility_count, visTotal: row.visibility_total })
    }
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { visCount, visTotal }]) => {
      const date = new Date(weekStart)
      const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      const day = date.getUTCDate()
      return {
        weekStart,
        weekLabel: `${month} ${day}`,
        visibility: visTotal > 0 ? (visCount / visTotal) * 100 : 0,
      }
    })
}

function groupByDay(rows: ApiBrandRow[]): DailyPoint[] {
  const dayMap = new Map<string, { visCount: number; visTotal: number }>()
  for (const row of rows) {
    if (!row.date) continue
    const key = row.date.slice(0, 10)
    const e = dayMap.get(key)
    if (e) { e.visCount += row.visibility_count; e.visTotal += row.visibility_total }
    else dayMap.set(key, { visCount: row.visibility_count, visTotal: row.visibility_total })
  }
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { visCount, visTotal }]) => ({ date, visibility: visTotal > 0 ? (visCount / visTotal) * 100 : 0 }))
}

// --- Paginated fetch for the selected date range ---

async function fetchAllRows(
  body: Record<string, unknown>,
  projectId?: string
): Promise<ApiBrandRow[]> {
  const limit = 500
  const allRows: ApiBrandRow[] = []
  let offset = 0
  while (offset < 10000) {
    const page = await peecPost<{ data: ApiBrandRow[] }>(
      '/reports/brands',
      { ...body, limit, offset },
      projectId
    )
    const rows = page.data ?? []
    allRows.push(...rows)
    if (rows.length < limit) break
    offset += limit
  }
  return allRows
}

// --- Main export ---

/**
 * Fetches full Peec brand visibility overview for a given client.
 *
 * @param clientSlug  Optional. When provided, resolves the Peec project ID from
 *                    clients.config.ts (peecCustomerProjectId). Falls back to the
 *                    PEEC_AI_PROJECT_ID env var when omitted (backward-compatible).
 * @param dateRange   Optional page date range (e.g. 'last_30_days', 'this_month').
 *                    All metrics are scoped to this range; deltas compare against
 *                    the immediately-preceding period of equal length. Defaults to
 *                    'last_30_days' to match the other AEO pages.
 */
// Cached per (clientSlug, dateRange) for 1 hour. Cache key derives from the
// function args (so 'avenue-z' and 'renaissance', and each date range, get their
// own entry). Without this wrapper, all clients shared one cache entry per fetch
// URL because Next.js fetch caching keys on URL — Peec puts project_id in the body.
async function getPeecOverviewImpl(clientSlug?: string, dateRange?: string): Promise<PeecOverview> {
  // Resolve project ID and "your brand" label per-client; fall back to env vars
  // when no clientSlug is provided (legacy single-tenant callers).
  let resolvedProjectId: string | undefined
  let resolvedYourBrand: string | undefined
  let resolvedYourDomain: string | null | undefined
  if (clientSlug) {
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    resolvedProjectId = config?.peecCustomerProjectId ?? process.env.PEEC_AI_PROJECT_ID
    resolvedYourBrand = config?.peecYourBrand ?? undefined
    resolvedYourDomain = config?.domain
  }
  // resolvedProjectId undefined = use env var inside peecPost/peecGet

  const yourBrand = resolvedYourBrand ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  // Scope every metric to the page date range; compare deltas against the
  // immediately-preceding period of equal length (matches the other AEO pages).
  const range = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(range)
  const compareDates = deriveCompareRange(range, 'previous_period') ?? mainDates
  const current = { start_date: mainDates.startDate, end_date: mainDates.endDate }
  const prior   = { start_date: compareDates.startDate, end_date: compareDates.endDate }

  // FB-022 + FB-024: visibility trend chart is always YTD, pinned to TODAY
  // (Jan 1 of the current year through today's date), independent of the page
  // date picker. Earlier FB-022 used mainDates.endDate which still reacted to
  // custom historical ranges (Tina's literal ask was "make static to always
  // show YTD"). Routes ONLY dailyVisibility/competitorDailyVisibility to this
  // window. Everything else (rankings, domains, KPIs) stays on the picker range.
  const todayISO = new Date().toISOString().slice(0, 10)
  const ytd = { start_date: `${todayISO.slice(0, 4)}-01-01`, end_date: todayISO }

  const pid = resolvedProjectId // shorthand

  const [currentBrandsRes, priorBrandsRes, domainsRes, domainsPriorRes, promptBrandsRes, queriesRes, llmBrandsRes, llmDomainsRes, tagsRes, promptsRes, promptBrandsPriorRes, trendRows, trendRowsYTD] = await Promise.all([
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, limit: 500 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior, limit: 500 }, pid),
    // FB-023: prompt-level rows now ALSO dimensioned by model so the Winners/Losers
    // compute can filter by the active model selection. Limit bumped from 2000 to
    // 5000 because rows are now (prompt × model). Adjust upward if Peec returns
    // truncated pages for clients with high prompt counts.
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['prompt_id', 'model_channel_id', 'model_id'], limit: 5000 }, pid),
    peecPost<{ data: ApiQueryRow[]; totalCount: number }>('/queries/search', { ...current, limit: 2000 }, pid),
    // FB-005: include both model_channel_id and model_id so we can bucket by
    // the friendly scraper id (e.g. "gemini-scraper") instead of the channel id
    // (e.g. "google-2" which contains "google" and would otherwise be misbucketed).
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, dimensions: ['model_channel_id', 'model_id'], limit: 2000 }, pid),
    // Real prompt taxonomy: tag id→name + each prompt's tags, for grouping by
    // the prompt's primary subject tag instead of keyword inference.
    peecGet<{ data: { id: string; name: string }[] }>('/tags', { limit: '500' }, pid),
    peecGet<{ data: { id: string; messages?: { content?: string }[]; tags?: { id: string }[] }[]; totalCount: number }>('/prompts', { limit: '1000' }, pid),
    // FB-023: prior-period prompt-level rows, same model-dimensioned shape as the
    // current-period fetch above. Used for the rank delta in Winners/Losers, with
    // model-filter reactivity per Tina's literal text on CSV E11.
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior, dimensions: ['prompt_id', 'model_channel_id', 'model_id'], limit: 5000 }, pid),
    // Daily trend series (paginated), picker-bound + a YTD variant for the chart
    // (FB-022). Independent of the calls above (only need current/ytd/pid), so
    // fetched concurrently with the batch instead of serially afterward.
    fetchAllRows({ ...current, dimensions: ['date'] }, pid),
    fetchAllRows({ ...ytd,     dimensions: ['date'] }, pid),
  ])


  // --- Brand rankings ---
  const currentAgg = aggregateBrandRows(currentBrandsRes.data ?? [])
  const priorAgg = aggregateBrandRows(priorBrandsRes.data ?? [])

  const brandRankings: BrandRanking[] = Array.from(currentAgg.entries())
    .map(([id, agg]) => {
      const curr = aggToMetrics(agg)
      const prev = priorAgg.has(id) ? aggToMetrics(priorAgg.get(id)!) : curr
      return {
        name: agg.name,
        visibility: curr.visibility,
        visibilityDelta: curr.visibility - prev.visibility,
        sov: curr.sov,
        sovDelta: curr.sov - prev.sov,
        sentiment: curr.sentiment,
        sentimentDelta: curr.sentiment - prev.sentiment,
        position: curr.position,
        positionDelta: curr.position - prev.position,
        isYou: yourBrand ? agg.name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
      }
    })
    .sort((a, b) => b.visibility - a.visibility)
    .map((b, i) => ({ ...b, rank: i + 1 }))

  // --- Top domains ---
  function buildTopDomains(data: ApiDomainRow[], priorData: ApiDomainRow[] = []): TopDomain[] {
    const priorMap = new Map(priorData.map((d) => [d.domain, d]))
    return (data ?? [])
      .sort((a, b) => b.retrieved_percentage - a.retrieved_percentage)
      .map((d) => {
        const prior = priorMap.get(d.domain)
        return {
          domain: d.domain,
          retrieved: d.retrieved_percentage * 100,
          retrievedDelta: prior ? (d.retrieved_percentage - prior.retrieved_percentage) * 100 : 0,
          citationRate: d.citation_rate * 100,
          citationRateDelta: prior ? (d.citation_rate - prior.citation_rate) * 100 : 0,
          citationCount: d.citation_count ?? 0,
          type: normalizeClassification(d.classification),
        }
      })
  }
  // Deltas (retrievedDelta / Post-Launch AI Lift) compare the selected range
  // against the immediately-preceding period of equal length.
  const topDomains = buildTopDomains(domainsRes.data ?? [], domainsPriorRes.data ?? [])
  const totalCitations = (domainsRes.data ?? []).reduce((s, d) => s + (d.citation_count ?? 0), 0)
  const totalCitationsPrior = (domainsPriorRes.data ?? []).reduce((s, d) => s + (d.citation_count ?? 0), 0)

  // Citation Share KPI: sum citations attributed to the client's own domain
  // (normalized host match) for both the current and prior period.
  const yourDomainKey = urlJoinKey(resolvedYourDomain ?? null)
  const sumOwnCitations = (rows: ApiDomainRow[]) => {
    if (!yourDomainKey) return 0
    return (rows ?? []).reduce((sum, d) => {
      const k = urlJoinKey(d.domain)
      return k === yourDomainKey ? sum + (d.citation_count ?? 0) : sum
    }, 0)
  }
  const yourBrandCitations      = sumOwnCitations(domainsRes.data ?? [])
  const yourBrandCitationsPrior = sumOwnCitations(domainsPriorRes.data ?? [])

  // --- Domain type breakdown ---
  const typeMap: Record<string, number> = {}
  for (const d of domainsRes.data ?? []) {
    const t = normalizeClassification(d.classification)
    typeMap[t] = (typeMap[t] ?? 0) + 1
  }
  const total = (domainsRes.data ?? []).length || 1
  const domainTypes: DomainType[] = Object.entries(typeMap)
    .map(([type, count]) => ({ type, percentage: Math.round((count / total) * 100) }))
    .sort((a, b) => b.percentage - a.percentage)

  // --- Tracked prompts ---
  function categorizePrompt(text: string): string {
    const t = text.toLowerCase()
    if (t.includes('seo') || t.includes('search engine optimization') || t.includes('organic search') || t.includes('keyword rank')) return 'SEO & Search'
    if (t.includes('pr ') || t.includes('public relations') || t.includes('media relations') || t.includes('press release') || t.includes('earned media') || t.includes('crisis comm')) return 'PR & Communications'
    if (t.includes('content') || t.includes('blog') || t.includes('copywriting') || t.includes('editorial')) return 'Content Marketing'
    if (t.includes('social media') || t.includes('instagram') || t.includes('tiktok') || t.includes('linkedin') || t.includes('facebook') || t.includes('twitter') || t.includes('x.com')) return 'Social Media'
    if (t.includes('paid') || t.includes('ppc') || t.includes('google ads') || t.includes('meta ads') || t.includes('advertising') || t.includes('sem ') || t.includes('display ad')) return 'Paid Media'
    if (t.includes('email') || t.includes('newsletter') || t.includes('drip') || t.includes('klaviyo') || t.includes('mailchimp')) return 'Email Marketing'
    if (t.includes('influencer') || t.includes('creator') || t.includes('ugc') || t.includes('ambassador')) return 'Influencer & Creator'
    if (t.includes('brand') || t.includes('reputation') || t.includes('awareness') || t.includes('identity')) return 'Brand & Reputation'
    if (t.includes('data') || t.includes('analytics') || t.includes('reporting') || t.includes('measurement') || t.includes('attribution')) return 'Analytics & Reporting'
    if (t.includes('ai ') || t.includes('artificial intelligence') || t.includes('machine learning') || t.includes('automation') || t.includes('aeo') || t.includes('answer engine') || t.includes('llm') || t.includes('chatgpt') || t.includes('generative')) return 'AI & Automation'
    if (t.includes('agency') || t.includes('firm') || t.includes(' hire') || t.includes('best ') || t.includes('top ') || t.includes('leading ')) return 'Agency Selection'
    return 'Digital Strategy'
  }

  function normalizeSource(id: string): string | null {
    const s = id.toLowerCase()
    if (s.includes('openai') || s.includes('chatgpt')) return 'ChatGPT'
    if (s.includes('perplexity')) return 'Perplexity'
    if (s.includes('gemini')) return 'Gemini'
    if (s.includes('claude')) return 'Claude'
    if (s.includes('copilot')) return 'Copilot'
    if (s.includes('google')) return 'Google'
    return null
  }

  // FB-023: Build per-prompt-per-model position maps for the CURRENT period.
  // promptBrandsRes is now dimensioned by ['prompt_id', 'model_channel_id', 'model_id'],
  // so each row is one (prompt × model) cell. We aggregate metric averages within
  // each cell, then later (a) aggregate across all models for promptMetricsById
  // for non-Winners/Losers consumers, (b) keep the per-model map for the
  // model-filter-aware Winners/Losers compute.
  type PromptMetric = { visibility: number; sov: number; position: number }
  type PromptModelAgg = { visCount: number; visTotal: number; sovSum: number; sovRows: number; posSum: number; posCount: number }
  const promptModelAggs = new Map<string, Map<AEOModel, PromptModelAgg>>()
  for (const row of promptBrandsRes.data ?? []) {
    if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
    const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
    if (!uuid) continue
    const rawModelId = row.model?.id ?? row.model_channel?.id ?? ''
    const model = normalizeSource(rawModelId) as AEOModel | null
    if (!model) continue
    if (!promptModelAggs.has(uuid)) promptModelAggs.set(uuid, new Map())
    const byModel = promptModelAggs.get(uuid)!
    const existing = byModel.get(model)
    if (existing) {
      existing.visCount += row.visibility_count
      existing.visTotal += row.visibility_total
      existing.sovSum   += row.share_of_voice
      existing.sovRows  += 1
      existing.posSum   += row.position_sum
      existing.posCount += row.position_count
    } else {
      byModel.set(model, {
        visCount: row.visibility_count, visTotal: row.visibility_total,
        sovSum:   row.share_of_voice,   sovRows:  1,
        posSum:   row.position_sum,     posCount: row.position_count,
      })
    }
  }

  // Flatten per-prompt across all models for the legacy promptMetricsById consumer
  // (used elsewhere on the page — visibility, sov, position aggregates).
  const promptMetricsById = new Map<string, PromptMetric>()
  // And build the per-model position map for Winners/Losers.
  const positionByUuidByModel = new Map<string, Partial<Record<AEOModel, number>>>()
  for (const [uuid, byModel] of promptModelAggs.entries()) {
    let visCount = 0, visTotal = 0, sovSum = 0, sovRows = 0, posSum = 0, posCount = 0
    const modelMap: Partial<Record<AEOModel, number>> = {}
    for (const [model, a] of byModel.entries()) {
      visCount += a.visCount; visTotal += a.visTotal
      sovSum   += a.sovSum;   sovRows  += a.sovRows
      posSum   += a.posSum;   posCount += a.posCount
      if (a.posCount > 0) modelMap[model] = a.posSum / a.posCount
    }
    promptMetricsById.set(uuid, {
      visibility: visTotal > 0 ? (visCount / visTotal) * 100 : 0,
      sov:        sovRows > 0 ? (sovSum / sovRows) * 100 : 0,
      position:   posCount > 0 ? posSum / posCount : 0,
    })
    positionByUuidByModel.set(uuid, modelMap)
  }

  // FB-023: same per-prompt-per-model aggregation for the PRIOR period.
  // Only the position-by-model map is needed downstream — used by
  // Winners/Losers to compute the rank delta with model-filter reactivity.
  const priorPositionByUuidByModel = new Map<string, Partial<Record<AEOModel, number>>>()
  {
    const priorAggs = new Map<string, Map<AEOModel, { posSum: number; posCount: number }>>()
    for (const row of promptBrandsPriorRes.data ?? []) {
      if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
      const uuid = row.prompt?.id != null ? String(row.prompt.id) : null
      if (!uuid) continue
      const rawModelId = row.model?.id ?? row.model_channel?.id ?? ''
      const model = normalizeSource(rawModelId) as AEOModel | null
      if (!model) continue
      if (!priorAggs.has(uuid)) priorAggs.set(uuid, new Map())
      const byModel = priorAggs.get(uuid)!
      const existing = byModel.get(model)
      if (existing) {
        existing.posSum   += row.position_sum
        existing.posCount += row.position_count
      } else {
        byModel.set(model, { posSum: row.position_sum, posCount: row.position_count })
      }
    }
    for (const [uuid, byModel] of priorAggs.entries()) {
      const modelMap: Partial<Record<AEOModel, number>> = {}
      for (const [model, a] of byModel.entries()) {
        if (a.posCount > 0) modelMap[model] = a.posSum / a.posCount
      }
      priorPositionByUuidByModel.set(uuid, modelMap)
    }
  }

  // Sources cited per prompt UUID (which AI models surfaced each prompt).
  const sourcesByUuid = new Map<string, Set<string>>()
  for (const q of queriesRes.data ?? []) {
    const uuid = q.prompt?.id ? String(q.prompt.id) : null
    if (!uuid) continue
    // Prefer the friendly scraper id (e.g. "gemini-scraper") over the channel id
    // (e.g. "google-2") so Gemini is not silently misbucketed into Google. FB-005.
    const source = normalizeSource(q.model?.id ?? q.model_channel?.id ?? '')
    if (!sourcesByUuid.has(uuid)) sourcesByUuid.set(uuid, new Set())
    if (source) sourcesByUuid.get(uuid)!.add(source)
  }

  // Peec organizes prompts with faceted tags (subject + intent + branded), not a
  // single topic. Group each prompt by its first *subject* tag, excluding the
  // intent and branded/non-branded facets; fall back to keyword inference when a
  // prompt carries no subject tag. Built from the real tracked prompts (one row
  // per prompt) rather than per-query-text rows.
  const FACET_TAGS = new Set(['commercial', 'informational', 'transactional', 'branded', 'non-branded'])
  const tagNameById = new Map((tagsRes.data ?? []).map((t) => [t.id, t.name]))

  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? []).map((p) => {
    const uuid = p.id
    const text = (p.messages ?? []).map((m) => m.content).filter(Boolean).join(' ').trim() || '(untitled prompt)'
    const subjectTag = (p.tags ?? [])
      .map((t) => tagNameById.get(t.id))
      .find((name): name is string => !!name && !FACET_TAGS.has(name.toLowerCase()))
    const m = promptMetricsById.get(uuid)
    return {
      text,
      sources: Array.from(sourcesByUuid.get(uuid) ?? []),
      visibility: m?.visibility ?? 0,
      sov: m?.sov ?? 0,
      position: m?.position ?? 0,
      positionByModel:      positionByUuidByModel.get(uuid)      ?? {},
      priorPositionByModel: priorPositionByUuidByModel.get(uuid) ?? {},
      group: subjectTag ?? categorizePrompt(text),
      topicSource: subjectTag ? 'provider' : 'inferred',
    }
  })

  // --- Visibility trend ---
  // weeklyVisibility/competitorWeeklyVisibility: picker-range bound (demand-overview reads these).
  // dailyVisibility/competitorDailyVisibility: ALWAYS YTD per Tina v2 (FB-022).
  const filterYou  = (rows: ApiBrandRow[]) => rows.filter((r) =>
    yourBrand ? r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : true
  )
  const filterComp = (rows: ApiBrandRow[]) => rows.filter((r) =>
    yourBrand ? !r.brand.name.toLowerCase().includes(yourBrand.toLowerCase()) : false
  )
  const weeklyVisibility           = groupByWeek(filterYou(trendRows))
  const competitorWeeklyVisibility = groupByWeek(filterComp(trendRows))
  const dailyVisibility            = groupByDay(filterYou(trendRowsYTD))
  const competitorDailyVisibility  = groupByDay(filterComp(trendRowsYTD))

  // --- LLM breakdown (your brand + own domains per model_channel) ---
  type LLMAgg = { visCount: number; visTotal: number; sovSum: number; sovRows: number; posSum: number; posCount: number }
  const llmAggMap = new Map<string, LLMAgg>()
  for (const row of llmBrandsRes.data ?? []) {
    if (yourBrand && !row.brand.name.toLowerCase().includes(yourBrand.toLowerCase())) continue
    const rawId = row.model?.id ?? row.model_channel?.id ?? ''
    const model = normalizeSource(rawId)
    if (!model) continue
    const e = llmAggMap.get(model)
    if (e) {
      e.visCount += row.visibility_count
      e.visTotal += row.visibility_total
      e.sovSum += row.share_of_voice
      e.sovRows += 1
      e.posSum += row.position_sum
      e.posCount += row.position_count
    } else {
      llmAggMap.set(model, { visCount: row.visibility_count, visTotal: row.visibility_total, sovSum: row.share_of_voice, sovRows: 1, posSum: row.position_sum, posCount: row.position_count })
    }
  }

  // Own domain retrieved % per LLM
  const llmOwnDomainMap = new Map<string, { retrievedSum: number; rows: number }>()
  for (const row of llmDomainsRes.data ?? []) {
    if (normalizeClassification(row.classification) !== 'Own') continue
    const rawId = row.model?.id ?? row.model_channel?.id ?? ''
    const model = normalizeSource(rawId)
    if (!model) continue
    const e = llmOwnDomainMap.get(model)
    if (e) { e.retrievedSum += row.retrieved_percentage; e.rows += 1 }
    else llmOwnDomainMap.set(model, { retrievedSum: row.retrieved_percentage, rows: 1 })
  }

  const llmBreakdown: LLMBreakdown[] = Array.from(llmAggMap.entries())
    .map(([model, agg]) => {
      const own = llmOwnDomainMap.get(model)
      return {
        model,
        visibility: agg.visTotal > 0 ? (agg.visCount / agg.visTotal) * 100 : 0,
        sov: agg.sovRows > 0 ? (agg.sovSum / agg.sovRows) * 100 : 0,
        position: agg.posCount > 0 ? agg.posSum / agg.posCount : 0,
        ownDomainRetrieved: own ? (own.retrievedSum / own.rows) * 100 : 0,
      }
    })
    .sort((a, b) => b.visibility - a.visibility)

  // --- Per-model domain citation counts ---
  // Uses the llmDomainsRes already fetched above (dimensions: ['model_channel_id']).
  const domainCitationsByModel: ByModel<string, number> = {}
  for (const row of llmDomainsRes.data ?? []) {
    const rawId = row.model?.id ?? row.model_channel?.id ?? ''
    const modelName = normalizeSource(rawId)
    if (!modelName) continue
    const domain = row.domain
    if (!domain) continue
    const count = row.citation_count ?? 0
    if (!domainCitationsByModel[domain]) domainCitationsByModel[domain] = {}
    const existing = domainCitationsByModel[domain][modelName as AEOModel] ?? 0
    domainCitationsByModel[domain][modelName as AEOModel] = existing + count
  }

  // --- Per-model brand visibility scores ---
  // Uses the llmBrandsRes already fetched above (dimensions: ['model_channel_id']).
  // visibility is a percentage (visCount/visTotal*100); we take the last value per
  // (brand, model) rather than summing, since percentages must not be summed across rows.
  const brandVisibilityByModel: ByModel<string, number> = {}
  for (const row of llmBrandsRes.data ?? []) {
    const rawId = row.model?.id ?? row.model_channel?.id ?? ''
    const modelName = normalizeSource(rawId)
    if (!modelName) continue
    const brandName = row.brand.name
    const vis = row.visibility_total > 0 ? (row.visibility_count / row.visibility_total) * 100 : 0
    if (!brandVisibilityByModel[brandName]) brandVisibilityByModel[brandName] = {}
    // Last value wins — API returns one row per (brand, model) for this dimension grouping.
    brandVisibilityByModel[brandName][modelName as AEOModel] = vis
  }

  const { totalByModel: totalCitationsByModel, yourByModel: yourBrandCitationsByModel } =
    citationTotalsByModel(domainCitationsByModel, (domain) => urlJoinKey(domain) === yourDomainKey)

  // --- Period change (selected range vs previous period) ---
  const brandsCurrentPts = Array.from(aggregateBrandRows(currentBrandsRes.data ?? []).entries()).map(([, a]) => ({
    name: a.name, visibility: aggToMetrics(a).visibility,
    isYou: yourBrand ? a.name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
  }))
  const brandsPriorPts = Array.from(aggregateBrandRows(priorBrandsRes.data ?? []).entries()).map(([, a]) => ({
    name: a.name, visibility: aggToMetrics(a).visibility,
    isYou: yourBrand ? a.name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
  }))
  const periodChange = buildPeriodChange({
    brandsCurrent: brandsCurrentPts,
    brandsPrior: brandsPriorPts,
    domainsCurrent: (domainsRes.data ?? []).map((d) => ({ domain: d.domain, share: d.retrieved_percentage * 100 })),
    domainsPrior:   (domainsPriorRes.data ?? []).map((d) => ({ domain: d.domain, share: d.retrieved_percentage * 100 })),
    prompts: trackedPrompts.map((p) => ({ text: p.text, visibility: p.visibility })),
  })

  // --- Competitor averages (current period, all non-you brands) ---
  const competitorAggs = Array.from(currentAgg.entries())
    .filter(([, agg]) => !yourBrand || !agg.name.toLowerCase().includes(yourBrand.toLowerCase()))
    .map(([, agg]) => aggToMetrics(agg))
  const compCount = competitorAggs.length || 1
  const competitorAverages: CompetitorAverages = {
    visibility: competitorAggs.reduce((s, a) => s + a.visibility, 0) / compCount,
    sov: competitorAggs.reduce((s, a) => s + a.sov, 0) / compCount,
    sentiment: competitorAggs.reduce((s, a) => s + a.sentiment, 0) / compCount,
    position: competitorAggs.reduce((s, a) => s + a.position, 0) / compCount,
  }

  return {
    weeklyVisibility,
    competitorWeeklyVisibility,
    dailyVisibility,
    competitorDailyVisibility,
    competitorAverages,
    brandRankings,
    topDomains,
    totalCitations,
    yourBrandCitations,
    yourBrandCitationsPrior,
    totalCitationsPrior,
    domainTypes,
    trackedPrompts,
    llmBreakdown,
    domainCitationsByModel,
    brandVisibilityByModel,
    totalCitationsByModel,
    yourBrandCitationsByModel,
    periodChange,
  }
}

export const getPeecOverview = cached(
  'peec',
  'getOverview',
  getPeecOverviewImpl,
  {
    // Bump version when response shape or fetch logic changes.
    // v2 = after PEEC_AI_ACCESS_TOKEN → PEEC_AI_CUSTOMER_TOKEN migration;
    //      old cached entries were populated with Avenue Z's data regardless
    //      of clientSlug.
    // v3 = after fixing the PEEC_AI_CUSTOMER_TOKEN value from a project-scoped
    //      `skp-` token to a customer-scoped `skc-` token. v2 cached entries
    //      contain the wrong project's data (Peec was ignoring project_id
    //      against the skp- token), so they need to be evicted.
    // v6 = "Last 30 days" domains now carry a prior-30d baseline (retrievedDelta /
    //      Post-Launch AI Lift); old v5 entries have retrievedDelta hard-0 for 30d.
    // v7 = overview now honors the page date range (dateRange arg); response shape
    //      flattened (brandRankings/topDomains/totalCitations replace the *ByRange
    //      records) and deltas compare vs the previous period, not prior year.
    // v9 = FB-051: TopDomain now carries citationCount (raw Peec citation_count
    //      integer). Required for §H.1 Citation Share share-of-period math.
    //      v8 cached entries lack this field -- must invalidate.
    //      v8 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    //      FB-023: TrackedPrompt now carries per-model position maps for both
    //      current and prior periods, from a new model-dimensioned
    //      promptBrandsPriorRes fetch + an updated current promptBrandsRes
    //      with the same dimensions. Used by lib/peec/winners-losers.ts.
    version: 'v9',
    tags: ['peec-overview'],
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
