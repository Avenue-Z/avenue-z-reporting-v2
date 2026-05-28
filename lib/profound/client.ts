import { timed } from '@/lib/perf'

const BASE_URL = 'https://api.tryprofound.com'

function getKey(): string {
  const key = process.env.PROFOUND_AI_ACCESS_TOKEN
  if (!key) throw new Error('Missing env var: PROFOUND_AI_ACCESS_TOKEN')
  return key
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
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
  group: string
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
  competitorAverages: CompetitorAverages
  brandRankings: BrandRanking[]
  brandRankingsByRange: Record<string, BrandRanking[]>
  domainsByRange: Record<string, TopDomain[]>
  totalCitationsByRange: Record<string, number>
  domainTypes: DomainType[]
  trackedPrompts: TrackedPrompt[]
  llmBreakdown: LLMBreakdown[]
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

function normalizeDomainType(c: string | null | undefined): string {
  switch ((c ?? '').toLowerCase()) {
    case 'own':           return 'Own'
    case 'ugc':           return 'UGC'
    case 'editorial':     return 'Editorial'
    case 'corporate':     return 'Corporate'
    case 'competitor':    return 'Competitor'
    case 'reference':     return 'Reference'
    case 'institutional': return 'Institutional'
    default:              return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other'
  }
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

function groupByWeekFromRows(
  rows: ProfoundRow[],
  filterFn: (asset: string) => boolean,
): WeeklyVisibility[] {
  const weekMap = new Map<string, { visSum: number; count: number }>()
  for (const row of rows) {
    const dateStr = row.dimensions[0]
    const asset = row.dimensions[1] ?? ''
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
    const domain = row.dimensions[0]
    if (!domain) continue
    priorShareMap.set(domain, (priorShareMap.get(domain) ?? 0) + (row.metrics[0] ?? 0) * 100)
    priorCountMap.set(domain, (priorCountMap.get(domain) ?? 0) + (row.metrics[1] ?? 0))
  }

  // Aggregate current by domain, keeping the type from the highest-share row
  type Agg = { citShare: number; count: number; type: string; maxShare: number }
  const aggMap = new Map<string, Agg>()
  for (const row of currentRows ?? []) {
    const domain = row.dimensions[0]
    if (!domain) continue
    const type = normalizeDomainType(row.dimensions[1])
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
      type,
    }))
    .sort((a, b) => b.retrieved - a.retrieved)
}

// --- Main export ---

async function getProfoundOverviewImpl(): Promise<ProfoundOverview> {
  const yourBrand =
    process.env.PROFOUND_AI_YOUR_BRAND ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  const categoryId = await getCategoryId()

  const thisYear = new Date().getUTCFullYear()
  const ytd = { start_date: `${thisYear}-01-01`, end_date: isoDate(new Date()) }
  const priorYtd = {
    start_date: `${thisYear - 1}-01-01`,
    end_date: `${thisYear - 1}-${isoDate(new Date()).slice(5)}`,
  }
  const last30Start = new Date()
  last30Start.setDate(last30Start.getDate() - 30)
  const last30 = { start_date: isoDate(last30Start), end_date: isoDate(new Date()) }

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
    brands30Res,
    weeklyRes,
    llmRes,
    domainsRes,
    priorDomainsRes,
    domains30Res,
    domainTypesRes,
    promptsRes,
  ] = await Promise.all([
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(priorYtd), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(last30), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: ['visibility_score'], dimensions: ['date', 'asset_name'], date_interval: 'day' }),
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: BRAND_METRICS, dimensions: ['model'], ...brandFilter }),
    profoundPost('/v1/reports/citations', { ...base(ytd), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(priorYtd), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(last30), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
    profoundPost('/v1/reports/citations', { ...base(ytd), metrics: ['citation_share'], dimensions: ['citation_category'] }),
    profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: BRAND_METRICS, dimensions: ['prompt'], ...brandFilter }),
  ])

  // --- Brand rankings ---
  const brandRankings = buildBrandRankings(currentBrandsRes.data, priorBrandsRes.data, yourBrand)
  const brandRankingsByRange: Record<string, BrandRanking[]> = {
    'YTD':          brandRankings,
    'Last 30 days': buildBrandRankings(brands30Res.data, [], yourBrand),
  }

  // --- Weekly visibility ---
  const isYou = (asset: string) =>
    yourBrand ? asset.toLowerCase().includes(yourBrand.toLowerCase()) : false
  const weeklyVisibility = groupByWeekFromRows(weeklyRes.data, isYou)
  const competitorWeeklyVisibility = groupByWeekFromRows(weeklyRes.data, (a) => !isYou(a))

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
  const domainsByRange: Record<string, TopDomain[]> = {
    'YTD':          buildTopDomains(domainsRes.data, priorDomainsRes.data),
    'Last 30 days': buildTopDomains(domains30Res.data, []),
  }
  const totalCitationsByRange: Record<string, number> = {
    'YTD':          (domainsRes.data ?? []).reduce((s, r) => s + (r.metrics[1] ?? 0), 0),
    'Last 30 days': (domains30Res.data ?? []).reduce((s, r) => s + (r.metrics[1] ?? 0), 0),
  }

  // --- Domain types ---
  const totalShare = (domainTypesRes.data ?? []).reduce((s, r) => s + (r.metrics[0] ?? 0), 0) || 1
  const domainTypes: DomainType[] = (domainTypesRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      type: normalizeDomainType(r.dimensions[0]),
      percentage: Math.round(((r.metrics[0] ?? 0) / totalShare) * 100),
    }))
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
  const trackedPrompts: TrackedPrompt[] = (promptsRes.data ?? [])
    .filter((r) => r.dimensions[0])
    .map((r) => ({
      text:       r.dimensions[0]!,
      sources:    [],
      visibility: (r.metrics[0] ?? 0) * 100,
      sov:        (r.metrics[1] ?? 0) * 100,
      position:   r.metrics[2] ?? 0,
      group:      categorizePrompt(r.dimensions[0]!),
    }))
    .sort((a, b) => b.visibility - a.visibility)

  return {
    weeklyVisibility,
    competitorWeeklyVisibility,
    competitorAverages,
    brandRankings,
    brandRankingsByRange,
    domainsByRange,
    totalCitationsByRange,
    domainTypes,
    trackedPrompts,
    llmBreakdown,
  }
}

export const getProfoundOverview = timed('profound', 'getOverview', getProfoundOverviewImpl)
