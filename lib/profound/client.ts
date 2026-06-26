import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { DailyPoint, PeriodChange, TopicSource } from '@/lib/aeo/types'
import { buildPeriodChange } from '@/lib/aeo/period-change'
import { urlJoinKey } from '@/lib/url'
import type { AEOModel } from '@/lib/peec/models'

const BASE_URL = 'https://api.tryprofound.com'

function getKey(): string {
  const key = process.env.PROFOUND_AI_ACCESS_TOKEN
  if (!key) throw new Error('Missing env var: PROFOUND_AI_ACCESS_TOKEN')
  return key
}

// --- Raw API types ---

type ProfoundRow = {
  metrics: number[]
  dimensions: (string | null)[]
}

type ProfoundResponse = {
  info: Record<string, unknown>
  data: ProfoundRow[]
}

// --- HTTP helpers ---

async function profoundPost(path: string, body: Record<string, unknown>): Promise<ProfoundResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'X-API-Key': getKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`[profound] ${res.status} ${path}:`, text)
    throw new Error(`Profound API error ${res.status}: ${path}`)
  }
  return res.json()
}

async function getCategoryId(): Promise<string> {
  const envId = process.env.PROFOUND_CATEGORY_ID
  if (envId) return envId
  const res = await fetch(`${BASE_URL}/v1/org/categories`, {
    headers: { 'X-API-Key': getKey() },
    next: { revalidate: 86400 },
  })
  if (!res.ok) throw new Error(`Profound categories error ${res.status}`)
  const body = await res.json()
  const id = body.data?.[0]?.id
  if (!id) throw new Error('No Profound categories found — set PROFOUND_CATEGORY_ID env var')
  return id
}

// --- Exported types (same shapes as Peec for UI component parity) ---

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
  retrieved: number       // citation share %
  retrievedDelta: number
  citationRate: number    // raw citation count
  citationRateDelta: number
  citationCount: number   // raw citation count (mirrors Peec TopDomain.citationCount for cross-provider use)
  priorCitationCount: number  // FB-058: prior-period citation count (from priorCountMap), for §H.1 Citation Share delta; mirrors Peec TopDomain.priorCitationCount
  type: string
}

export type DomainType = {
  type: string
  percentage: number
}

export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  /** Matches the Peec TrackedPrompt shape for cross-provider type compatibility.
   *  Profound does not currently fetch model-dimensioned prompt rows — always
   *  empty objects. The Winners/Losers compute uses these maps; with empty
   *  maps for both periods, the compute yields empty arrays, so Profound
   *  variant of Overview shows the empty-state cards. */
  positionByModel: Partial<Record<AEOModel, number>>
  priorPositionByModel: Partial<Record<AEOModel, number>>
  group: string
  topicSource: TopicSource
}

export type LLMBreakdown = {
  model: string
  visibility: number
  sov: number
  position: number
  ownDomainRetrieved: number
}

export type CompetitorAverages = {
  visibility: number
  sov: number
  sentiment: number
  position: number
}

export type ProfoundOverview = {
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
  /** Profound exposes no per-model citation data (v1). Always empty — Citation
   *  Share renders `--` on the Profound tab when a model filter is active. */
  totalCitationsByModel: Partial<Record<AEOModel, number>>
  yourBrandCitationsByModel: Partial<Record<AEOModel, number>>
  periodChange: PeriodChange
}

// --- Normalization helpers ---

function normalizeModel(id: string): string {
  const s = (id ?? '').toLowerCase()
  if (s.includes('chatgpt') || s.includes('openai') || s === 'gpt') return 'ChatGPT'
  if (s.includes('perplexity')) return 'Perplexity'
  if (s.includes('gemini') || (s.includes('google') && !s.includes('search'))) return 'Gemini'
  if (s.includes('claude') || s.includes('anthropic')) return 'Claude'
  if (s.includes('copilot') || s.includes('bing')) return 'Copilot'
  return id.charAt(0).toUpperCase() + id.slice(1)
}

// Maps Profound's citation_category taxonomy (owned, competition, earned_media,
// pr_wire, earned_institutions, social, other) onto the shared DomainType labels
// the table colors/definitions key on. Legacy labels are kept for safety.
function normalizeDomainType(c: string | null | undefined): string {
  switch ((c ?? '').toLowerCase()) {
    case 'owned':
    case 'own':                 return 'Own'
    case 'competition':
    case 'competitor':          return 'Competitor'
    case 'earned_media':
    case 'pr_wire':
    case 'editorial':           return 'Editorial'
    case 'social':
    case 'ugc':                 return 'UGC'
    case 'earned_institutions':
    case 'institutional':       return 'Institutional'
    case 'reference':           return 'Reference'
    case 'corporate':           return 'Corporate'
    case 'other':               return 'Other'
    default:                    return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other'
  }
}

// Profound returns citation rows ordered alphabetically by dimension name, so a
// ['hostname','citation_category'] query comes back as [citation_category,
// hostname]. Identify each field by shape (hostnames contain a dot).
function splitHostnameCategory(dims: (string | null)[]): { hostname: string | null; category: string | null } {
  let hostname: string | null = null
  let category: string | null = null
  for (const d of dims) {
    if (d == null) continue
    if (d.includes('.')) hostname = d
    else category = d
  }
  return { hostname, category }
}

function categorizePrompt(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('seo') || t.includes('search engine optimization') || t.includes('organic search') || t.includes('keyword rank')) return 'SEO & Search'
  if (t.includes('pr ') || t.includes('public relations') || t.includes('media relations') || t.includes('press release') || t.includes('earned media')) return 'PR & Communications'
  if (t.includes('content') || t.includes('blog') || t.includes('copywriting') || t.includes('editorial')) return 'Content Marketing'
  if (t.includes('social media') || t.includes('instagram') || t.includes('tiktok') || t.includes('linkedin') || t.includes('facebook') || t.includes('twitter')) return 'Social Media'
  if (t.includes('paid') || t.includes('ppc') || t.includes('google ads') || t.includes('meta ads') || t.includes('advertising') || t.includes('sem ')) return 'Paid Media'
  if (t.includes('email') || t.includes('newsletter') || t.includes('drip')) return 'Email Marketing'
  if (t.includes('influencer') || t.includes('creator') || t.includes('ugc') || t.includes('ambassador')) return 'Influencer & Creator'
  if (t.includes('brand') || t.includes('reputation') || t.includes('awareness') || t.includes('identity')) return 'Brand & Reputation'
  if (t.includes('data') || t.includes('analytics') || t.includes('reporting') || t.includes('measurement') || t.includes('attribution')) return 'Analytics & Reporting'
  if (t.includes('ai ') || t.includes('artificial intelligence') || t.includes('machine learning') || t.includes('automation') || t.includes('aeo') || t.includes('answer engine') || t.includes('llm') || t.includes('chatgpt') || t.includes('generative')) return 'AI & Automation'
  if (t.includes('agency') || t.includes('firm') || t.includes(' hire') || t.includes('best ') || t.includes('top ') || t.includes('leading ')) return 'Agency Selection'
  return 'Digital Strategy'
}

// --- Aggregation helpers ---

// Profound returns multi-dimension rows ordered alphabetically by dimension
// name, so a ['date','asset_name'] query comes back as [asset_name, date].
// Identify each field by shape rather than trusting positional order.
const DATE_DIM_RE = /^\d{4}-\d{2}-\d{2}/
function splitDateAsset(dims: (string | null)[]): { dateStr: string | null; asset: string } {
  let dateStr: string | null = null
  let asset = ''
  for (const d of dims) {
    if (d == null) continue
    if (DATE_DIM_RE.test(d)) dateStr = d
    else asset = d
  }
  return { dateStr, asset }
}

function groupByWeekFromRows(
  rows: ProfoundRow[],
  filterFn: (asset: string) => boolean,
): WeeklyVisibility[] {
  const weekMap = new Map<string, { visSum: number; count: number }>()
  for (const row of rows) {
    const { dateStr, asset } = splitDateAsset(row.dimensions)
    if (!dateStr || !filterFn(asset)) continue
    const vis = (row.metrics[0] ?? 0) * 100
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) continue
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day
    const monday = new Date(d)
    monday.setUTCDate(d.getUTCDate() + diff)
    const key = monday.toISOString().split('T')[0]
    const e = weekMap.get(key)
    if (e) { e.visSum += vis; e.count += 1 }
    else weekMap.set(key, { visSum: vis, count: 1 })
  }
  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, { visSum, count }]) => {
      const date = new Date(weekStart)
      const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      const day = date.getUTCDate()
      return { weekStart, weekLabel: `${month} ${day}`, visibility: visSum / count }
    })
}

function groupByDayFromRows(rows: ProfoundRow[], filterFn: (asset: string) => boolean): DailyPoint[] {
  const dayMap = new Map<string, { sum: number; count: number }>()
  for (const row of rows) {
    const { dateStr, asset } = splitDateAsset(row.dimensions)
    if (!dateStr || !filterFn(asset)) continue
    const key = dateStr.slice(0, 10)
    const vis = (row.metrics[0] ?? 0) * 100
    const e = dayMap.get(key)
    if (e) { e.sum += vis; e.count += 1 }
    else dayMap.set(key, { sum: vis, count: 1 })
  }
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({ date, visibility: sum / count }))
}

function buildBrandRankings(
  currentRows: ProfoundRow[],
  priorRows: ProfoundRow[],
  yourBrand: string,
): BrandRanking[] {
  const priorMap = new Map<string, ProfoundRow>()
  for (const row of priorRows) {
    const name = row.dimensions[0]
    if (name) priorMap.set(name, row)
  }
  return (currentRows ?? [])
    .filter((row) => row.dimensions[0])
    .map((row) => {
      const name = row.dimensions[0]!
      const vis = (row.metrics[0] ?? 0) * 100
      const sov = (row.metrics[1] ?? 0) * 100
      const pos = row.metrics[2] ?? 0
      const prior = priorMap.get(name)
      const priorVis = prior ? (prior.metrics[0] ?? 0) * 100 : vis
      const priorSov = prior ? (prior.metrics[1] ?? 0) * 100 : sov
      const priorPos = prior ? (prior.metrics[2] ?? 0) : pos
      return {
        name,
        visibility: vis,
        visibilityDelta: vis - priorVis,
        sov,
        sovDelta: sov - priorSov,
        sentiment: 0,
        sentimentDelta: 0,
        position: pos,
        positionDelta: pos - priorPos,
        isYou: yourBrand ? name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
      }
    })
    .sort((a, b) => b.visibility - a.visibility)
    .map((b, i) => ({ ...b, rank: i + 1 }))
}

function buildTopDomains(currentRows: ProfoundRow[], priorRows: ProfoundRow[]): TopDomain[] {
  // Aggregate prior by domain (multiple rows per domain when citation_category dimension is present)
  const priorShareMap = new Map<string, number>()
  const priorCountMap = new Map<string, number>()
  for (const row of priorRows ?? []) {
    const { hostname: domain } = splitHostnameCategory(row.dimensions)
    if (!domain) continue
    priorShareMap.set(domain, (priorShareMap.get(domain) ?? 0) + (row.metrics[0] ?? 0) * 100)
    priorCountMap.set(domain, (priorCountMap.get(domain) ?? 0) + (row.metrics[1] ?? 0))
  }

  // Aggregate current by domain, keeping the type from the highest-share row
  type Agg = { citShare: number; count: number; type: string; maxShare: number }
  const aggMap = new Map<string, Agg>()
  for (const row of currentRows ?? []) {
    const { hostname: domain, category } = splitHostnameCategory(row.dimensions)
    if (!domain) continue
    const type = normalizeDomainType(category)
    const citShare = (row.metrics[0] ?? 0) * 100
    const count = row.metrics[1] ?? 0
    const e = aggMap.get(domain)
    if (e) {
      e.citShare += citShare
      e.count += count
      if (citShare > e.maxShare) { e.type = type; e.maxShare = citShare }
    } else {
      aggMap.set(domain, { citShare, count, type, maxShare: citShare })
    }
  }

  return Array.from(aggMap.entries())
    .map(([domain, { citShare, count, type }]) => ({
      domain,
      retrieved: citShare,
      retrievedDelta: citShare - (priorShareMap.get(domain) ?? citShare),
      citationRate: count,
      citationRateDelta: count - (priorCountMap.get(domain) ?? count),
      citationCount: count,
      priorCitationCount: priorCountMap.get(domain) ?? 0,
      type,
    }))
    .sort((a, b) => b.retrieved - a.retrieved)
}

// --- Main export ---

function emptyOverview(): ProfoundOverview {
  return {
    weeklyVisibility:           [],
    competitorWeeklyVisibility: [],
    dailyVisibility:            [],
    competitorDailyVisibility:  [],
    competitorAverages:         { visibility: 0, sov: 0, sentiment: 0, position: 0 },
    brandRankings:              [],
    topDomains:                 [],
    totalCitations:             0,
    yourBrandCitations:         0,
    yourBrandCitationsPrior:    0,
    totalCitationsPrior:        0,
    domainTypes:                [],
    trackedPrompts:             [],
    llmBreakdown:               [],
    totalCitationsByModel:      {},
    yourBrandCitationsByModel:  {},
    periodChange:               { visibilityMover: null, domainMover: null, competitorShift: null, promptOpportunity: null },
  }
}

async function getProfoundOverviewImpl(clientSlug?: string, dateRange?: string): Promise<ProfoundOverview> {
  let yourBrand: string
  let categoryId: string
  let yourDomain: string | null = null

  if (clientSlug) {
    // Per-client mode: look up brand and category from DB. Do NOT fall back
    // to env vars when a slug is given — that would re-leak Avenue Z's
    // Profound data into other clients' reports (the pre-v2 behavior).
    const { getClientBySlug } = await import('@/lib/db/queries')
    const config = await getClientBySlug(clientSlug)
    if (!config?.profoundCategoryId) return emptyOverview()
    categoryId = config.profoundCategoryId
    yourBrand  = config.peecYourBrand ?? ''
    yourDomain = config.domain ?? null
  } else {
    // Legacy no-arg path. Kept for safety; all in-tree callers now pass a slug.
    yourBrand  = process.env.PROFOUND_AI_YOUR_BRAND ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
    categoryId = await getCategoryId()
  }

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
  // custom historical ranges. Tina's literal ask: "make static to always show YTD."
  const todayISO = new Date().toISOString().slice(0, 10)
  const ytd = { start_date: `${todayISO.slice(0, 4)}-01-01`, end_date: todayISO }

  const base = (dates: { start_date: string; end_date: string }) => ({
    category_id: categoryId,
    ...dates,
    pagination: { limit: 2000 },
  })

  const BRAND_METRICS = ['visibility_score', 'share_of_voice', 'average_position']
  const DOMAIN_METRICS = ['citation_share', 'count']
  const brandFilter = yourBrand
    ? { filters: [{ field: 'asset_name', operator: 'is', value: yourBrand }] }
    : {}

  const [
    currentBrandsRes,
    priorBrandsRes,
    weeklyRes,
    llmRes,
    domainsRes,
    priorDomainsRes,
    domainTypesRes,
    promptsRes,
    promptTopicsRes,
    weeklyYTDRes,
  ] = await Promise.all([
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(prior), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['model'], ...brandFilter }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(prior), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(current), metrics: ['citation_share'], dimensions: ['citation_category'] }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: BRAND_METRICS, dimensions: ['prompt'], ...brandFilter }),
    profoundPost('/v1/reports/visibility', { ...base(current), metrics: ['visibility_score'], dimensions: ['prompt', 'topic'] }),
    // FB-022: YTD trend for the visibility chart.
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
  ])

  // --- Brand rankings ---
  const brandRankings = buildBrandRankings(currentBrandsRes.data, priorBrandsRes.data, yourBrand)

  // --- Weekly visibility ---
  const isYou = (asset: string) =>
    yourBrand ? asset.toLowerCase().includes(yourBrand.toLowerCase()) : false
  // FB-022: weeklyVisibility stays picker-range bound (demand-overview consumer).
  // dailyVisibility/competitorDailyVisibility are ALWAYS YTD for the trend chart.
  const weeklyVisibility           = groupByWeekFromRows(weeklyRes.data,    isYou)
  const competitorWeeklyVisibility = groupByWeekFromRows(weeklyRes.data,    (a) => !isYou(a))
  const dailyVisibility            = groupByDayFromRows(weeklyYTDRes.data,  isYou)
  const competitorDailyVisibility  = groupByDayFromRows(weeklyYTDRes.data,  (a) => !isYou(a))

  // --- Competitor averages ---
  const competitors = brandRankings.filter((b) => !b.isYou)
  const compCount = competitors.length || 1
  const competitorAverages: CompetitorAverages = {
    visibility: competitors.reduce((s, b) => s + b.visibility, 0) / compCount,
    sov:        competitors.reduce((s, b) => s + b.sov, 0) / compCount,
    sentiment:  0,
    position:   competitors.reduce((s, b) => s + b.position, 0) / compCount,
  }

  // --- Domains ---
  // Deltas compare the selected range against the immediately-preceding period.
  const topDomains = buildTopDomains(domainsRes.data, priorDomainsRes.data)
  const totalCitations      = (domainsRes.data ?? []).reduce((s, r) => s + (r.metrics[1] ?? 0), 0)
  const totalCitationsPrior = (priorDomainsRes.data ?? []).reduce((s, r) => s + (r.metrics[1] ?? 0), 0)

  // Citation Share KPI: sum citations attributed to the client's own domain
  // (normalized host match) for both the current and prior period. Same math
  // as Peec — share of total tracked-domain citations belonging to the client.
  const yourDomainKey = urlJoinKey(yourDomain)
  const sumOwnCitations = (rows: ProfoundRow[]) => {
    if (!yourDomainKey) return 0
    return (rows ?? []).reduce((sum, r) => {
      const { hostname } = splitHostnameCategory(r.dimensions)
      return urlJoinKey(hostname) === yourDomainKey ? sum + (r.metrics[1] ?? 0) : sum
    }, 0)
  }
  const yourBrandCitations      = sumOwnCitations(domainsRes.data ?? [])
  const yourBrandCitationsPrior = sumOwnCitations(priorDomainsRes.data ?? [])

  // --- Domain types (aggregate Profound categories onto shared type labels) ---
  const totalShare = (domainTypesRes.data ?? []).reduce((s, r) => s + (r.metrics[0] ?? 0), 0) || 1
  const typeShareMap = new Map<string, number>()
  for (const r of domainTypesRes.data ?? []) {
    if (!r.dimensions[0]) continue
    const type = normalizeDomainType(r.dimensions[0])
    typeShareMap.set(type, (typeShareMap.get(type) ?? 0) + (r.metrics[0] ?? 0))
  }
  const domainTypes: DomainType[] = Array.from(typeShareMap.entries())
    .map(([type, share]) => ({ type, percentage: Math.round((share / totalShare) * 100) }))
    .sort((a, b) => b.percentage - a.percentage)

  // --- LLM breakdown ---
  const llmBreakdown: LLMBreakdown[] = (llmRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      model:             normalizeModel(r.dimensions[0]!),
      visibility:        (r.metrics[0] ?? 0) * 100,
      sov:               (r.metrics[1] ?? 0) * 100,
      position:          r.metrics[2] ?? 0,
      ownDomainRetrieved: 0,
    }))
    .sort((a, b) => b.visibility - a.visibility)

  // --- Tracked prompts ---
  const promptTopic = new Map<string, string>()
  for (const r of promptTopicsRes.data ?? []) {
    const prompt = r.dimensions[0]
    const topic = r.dimensions[1]
    if (prompt && topic) promptTopic.set(prompt, topic)
  }
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      text:        r.dimensions[0]!,
      sources:     [],
      visibility:  (r.metrics[0] ?? 0) * 100,
      sov:         (r.metrics[1] ?? 0) * 100,
      position:    r.metrics[2] ?? 0,
      positionByModel:      {},
      priorPositionByModel: {},
      group:       promptTopic.get(r.dimensions[0]!) ?? categorizePrompt(r.dimensions[0]!),
      topicSource: (promptTopic.has(r.dimensions[0]!) ? 'provider' : 'inferred') as TopicSource,
    }))
    .sort((a, b) => b.visibility - a.visibility)

  // --- Period change (selected range vs previous period) ---
  const brandsCurrent = buildBrandRankings(currentBrandsRes.data, [], yourBrand)
  const brandsPrior = buildBrandRankings(priorBrandsRes.data, [], yourBrand)
  const domainShare = (rows: ProfoundRow[]) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      const { hostname: domain } = splitHostnameCategory(r.dimensions)
      if (!domain) continue
      m.set(domain, (m.get(domain) ?? 0) + (r.metrics[0] ?? 0) * 100)
    }
    return Array.from(m.entries()).map(([domain, share]) => ({ domain, share }))
  }
  const periodChange = buildPeriodChange({
    brandsCurrent: brandsCurrent.map((b) => ({ name: b.name, visibility: b.visibility, isYou: !!b.isYou })),
    brandsPrior:   brandsPrior.map((b) => ({ name: b.name, visibility: b.visibility, isYou: !!b.isYou })),
    domainsCurrent: domainShare(domainsRes.data),
    domainsPrior:   domainShare(priorDomainsRes.data),
    prompts: trackedPrompts.map((p) => ({ text: p.text, visibility: p.visibility })),
  })

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
    totalCitationsByModel: {},
    yourBrandCitationsByModel: {},
    periodChange,
  }
}

export const getProfoundOverview = cached(
  'profound',
  'getOverview',
  getProfoundOverviewImpl,
  {
    // v2 = post per-client refactor. Old v1 entries were populated with
    // Avenue Z's data regardless of caller; do not drop this without a
    // production cache flush.
    // v4 = overview now honors the page date range (dateRange arg); response shape
    //      flattened (brandRankings/topDomains/totalCitations replace the *ByRange
    //      records) and deltas compare vs the previous period, not prior year.
    // v5 = FB-022: visibility trend chart now uses a separate YTD fetch
    //      (dailyVisibility/competitorDailyVisibility), while weeklyVisibility
    //      stays picker-range bound for the demand-overview consumer.
    version: 'v5',
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)
