/**
 * Sample PeecOverview for demo mode. Force-substituted into all four
 * AEO subsections (Overview, PR Influence, Content Impact, Technical
 * Audit) whenever demoMode is on, so the demo never blends real Peec
 * data with sample data from other sources.
 *
 * Tuned for an "Avenue Z" demo brand competing against the major PR /
 * brand-marketing agencies. Numbers are deterministic.
 */
import type {
  PeecOverview, BrandRanking, TopDomain, WeeklyVisibility,
  TrackedPrompt, LLMBreakdown, CompetitorAverages, DomainType,
} from '@/lib/peec/client'
import type { ByModel } from '@/lib/peec/by-model'

const YOUR_BRAND = 'Avenue Z'

const BRANDS: BrandRanking[] = [
  { rank: 1, name: 'Avenue Z',         visibility: 42.3, visibilityDelta:  6.1, sov: 18.7, sovDelta:  3.2, sentiment: 0.78, sentimentDelta:  0.04, position: 2.4, positionDelta: -0.3, isYou: true },
  { rank: 2, name: 'Edelman',          visibility: 38.9, visibilityDelta: -1.4, sov: 17.1, sovDelta: -0.8, sentiment: 0.71, sentimentDelta:  0.01, position: 2.7, positionDelta:  0.1 },
  { rank: 3, name: 'Ogilvy',           visibility: 35.2, visibilityDelta:  2.0, sov: 15.6, sovDelta:  1.1, sentiment: 0.74, sentimentDelta: -0.02, position: 2.9, positionDelta:  0.0 },
  { rank: 4, name: 'Weber Shandwick',  visibility: 31.4, visibilityDelta: -0.9, sov: 13.2, sovDelta: -0.4, sentiment: 0.68, sentimentDelta:  0.02, position: 3.2, positionDelta:  0.2 },
  { rank: 5, name: 'BCW',              visibility: 27.8, visibilityDelta:  1.3, sov: 11.5, sovDelta:  0.6, sentiment: 0.66, sentimentDelta:  0.00, position: 3.5, positionDelta: -0.1 },
  { rank: 6, name: 'FleishmanHillard', visibility: 24.6, visibilityDelta:  0.7, sov: 10.2, sovDelta:  0.3, sentiment: 0.64, sentimentDelta:  0.01, position: 3.7, positionDelta:  0.0 },
  { rank: 7, name: 'MSL',              visibility: 21.9, visibilityDelta: -2.1, sov:  8.6, sovDelta: -1.2, sentiment: 0.62, sentimentDelta: -0.03, position: 3.9, positionDelta:  0.3 },
  { rank: 8, name: 'Hill+Knowlton',    visibility: 18.4, visibilityDelta:  0.4, sov:  5.1, sovDelta:  0.2, sentiment: 0.59, sentimentDelta: -0.01, position: 4.2, positionDelta:  0.1 },
]

function weeklyTrend(start: number, range: number, weeks = 16, noise = 0.6): WeeklyVisibility[] {
  const result: WeeklyVisibility[] = []
  const base = new Date('2026-02-09')
  for (let w = 0; w < weeks; w++) {
    const d = new Date(base)
    d.setDate(d.getDate() + w * 7)
    const t = w / Math.max(weeks - 1, 1)
    const drift = start + (range * t)
    const wave  = Math.sin(w * 0.9) * noise
    result.push({
      weekStart: d.toISOString().slice(0, 10),
      weekLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      visibility: Math.max(0, drift + wave),
    })
  }
  return result
}

function dailyTrend(start: number, range: number, days = 112, noise = 0.6): import('@/lib/aeo/types').DailyPoint[] {
  const result: import('@/lib/aeo/types').DailyPoint[] = []
  const base = new Date('2026-02-09')
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const t = i / Math.max(days - 1, 1)
    const wave = Math.sin(i * 0.3) * noise
    result.push({ date: d.toISOString().slice(0, 10), visibility: Math.max(0, start + range * t + wave) })
  }
  return result
}

const TOP_DOMAINS_YTD: TopDomain[] = [
  // Own
  { domain: 'avenuez.com',                 retrieved: 24.3, retrievedDelta:  3.1, citationRate: 32.1, citationRateDelta: 4.2, type: 'Own' },
  { domain: 'blog.avenuez.com',            retrieved:  9.8, retrievedDelta:  1.4, citationRate: 14.5, citationRateDelta: 2.1, type: 'Own' },
  // Editorial
  { domain: 'techcrunch.com',              retrieved: 18.7, retrievedDelta:  2.4, citationRate: 26.4, citationRateDelta: 3.1, type: 'Editorial' },
  { domain: 'forbes.com',                  retrieved: 16.1, retrievedDelta:  1.2, citationRate: 23.8, citationRateDelta: 1.9, type: 'Editorial' },
  { domain: 'adage.com',                   retrieved: 12.4, retrievedDelta: -0.6, citationRate: 19.2, citationRateDelta: 0.4, type: 'Editorial' },
  { domain: 'prweek.com',                  retrieved: 10.9, retrievedDelta:  0.8, citationRate: 17.5, citationRateDelta: 1.2, type: 'Editorial' },
  { domain: 'adweek.com',                  retrieved:  9.2, retrievedDelta:  1.6, citationRate: 15.6, citationRateDelta: 2.0, type: 'Editorial' },
  { domain: 'marketingdive.com',           retrieved:  7.8, retrievedDelta:  0.3, citationRate: 13.2, citationRateDelta: 0.7, type: 'Editorial' },
  { domain: 'businessinsider.com',         retrieved:  6.4, retrievedDelta: -0.9, citationRate: 11.4, citationRateDelta: -0.5, type: 'Editorial' },
  { domain: 'wsj.com',                     retrieved:  5.1, retrievedDelta:  0.2, citationRate:  9.8, citationRateDelta: 0.3, type: 'Editorial' },
  // Competitor
  { domain: 'edelman.com',                 retrieved: 15.2, retrievedDelta: -1.1, citationRate: 22.4, citationRateDelta: -0.8, type: 'Competitor' },
  { domain: 'ogilvy.com',                  retrieved: 13.4, retrievedDelta:  1.0, citationRate: 19.7, citationRateDelta: 1.4, type: 'Competitor' },
  { domain: 'webershandwick.com',          retrieved: 11.6, retrievedDelta: -0.4, citationRate: 17.1, citationRateDelta: -0.3, type: 'Competitor' },
  { domain: 'bcw-global.com',              retrieved:  9.8, retrievedDelta:  0.7, citationRate: 14.4, citationRateDelta: 0.9, type: 'Competitor' },
  { domain: 'fleishmanhillard.com',        retrieved:  8.1, retrievedDelta:  0.3, citationRate: 12.0, citationRateDelta: 0.5, type: 'Competitor' },
  { domain: 'mslgroup.com',                retrieved:  6.7, retrievedDelta: -1.5, citationRate:  9.8, citationRateDelta: -1.1, type: 'Competitor' },
  // Reference / institutional
  { domain: 'en.wikipedia.org',            retrieved:  4.8, retrievedDelta:  0.0, citationRate:  7.2, citationRateDelta:  0.0, type: 'Reference' },
  { domain: 'g2.com',                      retrieved:  3.9, retrievedDelta:  0.2, citationRate:  5.8, citationRateDelta:  0.3, type: 'Reference' },
  { domain: 'clutch.co',                   retrieved:  3.2, retrievedDelta: -0.1, citationRate:  4.7, citationRateDelta: -0.1, type: 'Reference' },
  { domain: 'reddit.com',                  retrieved:  2.6, retrievedDelta:  0.4, citationRate:  3.9, citationRateDelta:  0.5, type: 'UGC' },
]

// topicSource is added in samplePeecOverview() via .map, so it's omitted here.
const TRACKED_PROMPTS: Omit<TrackedPrompt, 'topicSource'>[] = [
  // Agency Selection
  { text: 'best PR agency for tech startups',                    sources: ['ChatGPT', 'Claude', 'Perplexity'], visibility: 58.4, sov: 24.1, position: 1.8, group: 'Agency Selection' },
  { text: 'top digital marketing agencies 2026',                 sources: ['ChatGPT', 'Gemini'],               visibility: 48.2, sov: 19.3, position: 2.4, group: 'Agency Selection' },
  { text: 'best brand strategy agency NYC',                      sources: ['Claude', 'Perplexity'],            visibility: 41.7, sov: 16.8, position: 2.7, group: 'Agency Selection' },
  { text: 'leading AI marketing firms',                          sources: ['ChatGPT', 'Perplexity', 'Gemini'], visibility: 52.1, sov: 21.4, position: 2.1, group: 'Agency Selection' },
  // AI & Automation
  { text: 'how does answer engine optimization work',            sources: ['ChatGPT', 'Claude'],               visibility: 39.6, sov: 14.2, position: 2.9, group: 'AI & Automation' },
  { text: 'what is AEO vs SEO',                                  sources: ['ChatGPT', 'Perplexity'],           visibility: 44.3, sov: 17.6, position: 2.3, group: 'AI & Automation' },
  { text: 'audit brand visibility in ChatGPT',                   sources: ['Claude', 'Perplexity'],            visibility: 36.8, sov: 12.7, position: 3.1, group: 'AI & Automation' },
  // PR & Communications
  { text: 'PR agency for B2B SaaS',                              sources: ['ChatGPT', 'Gemini'],               visibility: 33.4, sov: 11.8, position: 3.3, group: 'PR & Communications' },
  { text: 'earned media strategy for growth-stage startups',     sources: ['Claude'],                          visibility: 28.9, sov:  9.4, position: 3.6, group: 'PR & Communications' },
  // Brand & Reputation
  { text: 'brand reputation monitoring tools',                   sources: ['ChatGPT', 'Perplexity'],           visibility: 31.2, sov: 10.7, position: 3.4, group: 'Brand & Reputation' },
  { text: 'how to measure share of voice in AI search',          sources: ['ChatGPT', 'Claude'],               visibility: 26.5, sov:  8.9, position: 3.8, group: 'Brand & Reputation' },
  // Analytics & Reporting
  { text: 'AI search analytics dashboard',                       sources: ['Claude', 'Perplexity'],            visibility: 22.7, sov:  7.3, position: 4.0, group: 'Analytics & Reporting' },
  { text: 'tracking citations in LLMs',                          sources: ['ChatGPT'],                         visibility: 19.4, sov:  6.1, position: 4.3, group: 'Analytics & Reporting' },
]

const LLM_BREAKDOWN: LLMBreakdown[] = [
  { model: 'ChatGPT',    visibility: 44.7, sov: 19.8, position: 2.2, ownDomainRetrieved: 28.1 },
  { model: 'Claude',     visibility: 41.3, sov: 17.4, position: 2.4, ownDomainRetrieved: 24.6 },
  { model: 'Perplexity', visibility: 47.9, sov: 21.2, position: 2.0, ownDomainRetrieved: 31.4 },
  { model: 'Gemini',     visibility: 36.8, sov: 14.7, position: 2.7, ownDomainRetrieved: 19.3 },
  { model: 'Copilot',    visibility: 32.1, sov: 12.9, position: 2.9, ownDomainRetrieved: 16.8 },
]

const DOMAIN_TYPES: DomainType[] = [
  { type: 'Editorial',     percentage: 38 },
  { type: 'Competitor',    percentage: 24 },
  { type: 'Own',           percentage: 14 },
  { type: 'Reference',     percentage: 11 },
  { type: 'Corporate',     percentage:  7 },
  { type: 'UGC',           percentage:  4 },
  { type: 'Institutional', percentage:  2 },
]

const COMPETITOR_AVERAGES: CompetitorAverages = {
  visibility: 27.4, sov: 11.6, sentiment: 0.66, position: 3.5,
}

const DOMAIN_CITATIONS_BY_MODEL: ByModel<string, number> = {
  'avenuez.com':        { ChatGPT: 142, Claude: 98,  Perplexity: 187, Gemini: 76,  Copilot: 54 },
  'blog.avenuez.com':   { ChatGPT:  54, Claude: 41,  Perplexity:  72, Gemini: 28,  Copilot: 19 },
  'techcrunch.com':     { ChatGPT: 214, Claude: 161, Perplexity: 248, Gemini: 134, Copilot: 97 },
  'forbes.com':         { ChatGPT: 189, Claude: 142, Perplexity: 221, Gemini: 118, Copilot: 83 },
  'edelman.com':        { ChatGPT: 167, Claude: 124, Perplexity: 198, Gemini: 104, Copilot: 72 },
  'ogilvy.com':         { ChatGPT: 143, Claude: 107, Perplexity: 171, Gemini:  89, Copilot: 62 },
  'en.wikipedia.org':   { ChatGPT:  48,               Perplexity:  62, Gemini:  34              },
}

const BRAND_VISIBILITY_BY_MODEL: ByModel<string, number> = {
  'Avenue Z':         { ChatGPT: 44.7, Claude: 41.3, Perplexity: 47.9, Gemini: 36.8, Copilot: 32.1 },
  'Edelman':          { ChatGPT: 40.1, Claude: 37.6, Perplexity: 43.2, Gemini: 33.4, Copilot: 29.0 },
  'Ogilvy':           { ChatGPT: 36.4, Claude: 34.1, Perplexity: 39.7, Gemini: 30.2, Copilot: 26.5 },
  'Weber Shandwick':  { ChatGPT: 32.8, Claude: 30.6, Perplexity: 35.4, Gemini: 27.1, Copilot: 23.7 },
  'BCW':              { ChatGPT: 29.0, Claude: 27.1, Perplexity: 31.3, Gemini: 24.0, Copilot: 20.9 },
  'FleishmanHillard': { ChatGPT: 25.4, Claude: 23.8, Perplexity: 27.6, Gemini: 21.0, Copilot: 18.3 },
  'MSL':              { ChatGPT: 22.7, Claude: 21.2, Perplexity: 24.5, Gemini: 18.7, Copilot: 16.3 },
  'Hill+Knowlton':    { ChatGPT: 19.0, Claude: 17.8, Perplexity: 20.6, Gemini: 15.7, Copilot: 13.7 },
}

export function samplePeecOverview(): PeecOverview {
  return {
    weeklyVisibility:           weeklyTrend(34, 9),
    competitorWeeklyVisibility: weeklyTrend(28, 1),
    dailyVisibility:            dailyTrend(34, 9),
    competitorDailyVisibility:  dailyTrend(28, 1),
    periodChange: {
      visibilityMover: { label: 'Avenue Z', delta: 6.1 },
      domainMover:     { label: 'techcrunch.com', delta: 2.4 },
      competitorShift: { label: 'Ogilvy', delta: 2.0 },
      promptOpportunity: { text: 'tracking citations in LLMs', visibility: 19.4 },
    },
    competitorAverages:         COMPETITOR_AVERAGES,
    brandRankings:              BRANDS,
    topDomains:                 TOP_DOMAINS_YTD,
    totalCitations:             3247,
    yourBrandCitations:         421,
    yourBrandCitationsPrior:    389,
    totalCitationsPrior:        3082,
    domainTypes:    DOMAIN_TYPES,
    trackedPrompts: TRACKED_PROMPTS.map((p) => ({ ...p, topicSource: 'inferred' as const })),
    llmBreakdown:   LLM_BREAKDOWN,
    domainCitationsByModel: DOMAIN_CITATIONS_BY_MODEL,
    brandVisibilityByModel: BRAND_VISIBILITY_BY_MODEL,
  }
}

// Helper for components that need to know the demo brand name
export const SAMPLE_PEEC_YOUR_BRAND = YOUR_BRAND
