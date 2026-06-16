/**
 * Sample ProfoundOverview for demo mode. Used when demoMode is on AND
 * the real profound fetch returned empty (no profoundCategoryId
 * configured) or errored. Lets a sales demo show the report fully
 * populated without needing every client's Profound to be wired up.
 *
 * Shape mirrors lib/profound/client.ts ProfoundOverview exactly.
 */
import type { ProfoundOverview } from '@/lib/profound/client'

import type { BrandRanking } from '@/lib/profound/client'

const BRANDS: BrandRanking[] = [
  { rank: 2, name: 'Avenue Z',         visibility: 42.8, sov: 18.4, sentiment: 72, sentimentDelta:  4, position: 2.3, visibilityDelta:  6.2, sovDelta:  3.1, positionDelta: -0.4, isYou: true  },
  { rank: 1, name: 'Ogilvy',           visibility: 48.1, sov: 22.6, sentiment: 68, sentimentDelta:  1, position: 1.9, visibilityDelta:  2.1, sovDelta:  1.4, positionDelta:  0.1, isYou: false },
  { rank: 3, name: 'Edelman',          visibility: 41.0, sov: 17.2, sentiment: 65, sentimentDelta: -2, position: 2.7, visibilityDelta: -1.8, sovDelta: -2.3, positionDelta:  0.3, isYou: false },
  { rank: 4, name: 'Weber Shandwick',  visibility: 38.4, sov: 14.9, sentiment: 63, sentimentDelta:  0, position: 2.9, visibilityDelta:  0.9, sovDelta:  0.4, positionDelta: -0.2, isYou: false },
  { rank: 5, name: 'FleishmanHillard', visibility: 35.7, sov: 13.1, sentiment: 61, sentimentDelta:  2, position: 3.2, visibilityDelta:  1.4, sovDelta:  0.7, positionDelta:  0.0, isYou: false },
  { rank: 6, name: 'Burson',           visibility: 31.5, sov: 10.4, sentiment: 58, sentimentDelta: -1, position: 3.5, visibilityDelta: -0.6, sovDelta: -0.3, positionDelta:  0.2, isYou: false },
  { rank: 7, name: 'BCW',              visibility: 28.1, sov:  8.7, sentiment: 60, sentimentDelta:  3, position: 3.9, visibilityDelta:  2.4, sovDelta:  1.0, positionDelta: -0.5, isYou: false },
  { rank: 8, name: 'Praytell',         visibility: 22.3, sov:  6.2, sentiment: 62, sentimentDelta:  5, position: 4.4, visibilityDelta:  3.8, sovDelta:  1.9, positionDelta: -0.8, isYou: false },
]

const WEEKLY_VISIBILITY = [
  { weekStart: '2026-03-03', weekLabel: 'Mar 3',  visibility: 32.1 },
  { weekStart: '2026-03-10', weekLabel: 'Mar 10', visibility: 33.8 },
  { weekStart: '2026-03-17', weekLabel: 'Mar 17', visibility: 35.2 },
  { weekStart: '2026-03-24', weekLabel: 'Mar 24', visibility: 36.7 },
  { weekStart: '2026-03-31', weekLabel: 'Mar 31', visibility: 38.4 },
  { weekStart: '2026-04-07', weekLabel: 'Apr 7',  visibility: 37.9 },
  { weekStart: '2026-04-14', weekLabel: 'Apr 14', visibility: 39.5 },
  { weekStart: '2026-04-21', weekLabel: 'Apr 21', visibility: 40.8 },
  { weekStart: '2026-04-28', weekLabel: 'Apr 28', visibility: 41.6 },
  { weekStart: '2026-05-05', weekLabel: 'May 5',  visibility: 42.3 },
  { weekStart: '2026-05-12', weekLabel: 'May 12', visibility: 41.9 },
  { weekStart: '2026-05-19', weekLabel: 'May 19', visibility: 42.8 },
]

const COMPETITOR_WEEKLY = WEEKLY_VISIBILITY.map((w) => ({
  ...w,
  visibility: w.visibility * 0.85, // competitor avg slightly lower
}))

function dailyFromWeekly(weekly: typeof WEEKLY_VISIBILITY): import('@/lib/aeo/types').DailyPoint[] {
  const out: import('@/lib/aeo/types').DailyPoint[] = []
  for (const w of weekly) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(w.weekStart)
      d.setUTCDate(d.getUTCDate() + i)
      out.push({ date: d.toISOString().slice(0, 10), visibility: w.visibility })
    }
  }
  return out
}

const TOP_DOMAINS = [
  { domain: 'forbes.com',          type: 'Editorial' as const,     retrieved: 287, retrievedDelta:  42, citationRate: 0.184, citationRateDelta:  0.024 },
  { domain: 'techcrunch.com',      type: 'Editorial' as const,     retrieved: 213, retrievedDelta:  28, citationRate: 0.142, citationRateDelta:  0.018 },
  { domain: 'avenuez.com',         type: 'Own' as const,           retrieved: 198, retrievedDelta:  31, citationRate: 0.127, citationRateDelta:  0.020 },
  { domain: 'reddit.com',          type: 'UGC' as const,           retrieved: 156, retrievedDelta: -14, citationRate: 0.098, citationRateDelta: -0.012 },
  { domain: 'wsj.com',             type: 'Editorial' as const,     retrieved: 134, retrievedDelta:  19, citationRate: 0.084, citationRateDelta:  0.011 },
  { domain: 'wikipedia.org',       type: 'Reference' as const,     retrieved: 121, retrievedDelta:   8, citationRate: 0.076, citationRateDelta:  0.005 },
  { domain: 'adweek.com',          type: 'Editorial' as const,     retrieved: 108, retrievedDelta:  15, citationRate: 0.067, citationRateDelta:  0.009 },
  { domain: 'linkedin.com',        type: 'UGC' as const,           retrieved:  92, retrievedDelta:  -3, citationRate: 0.057, citationRateDelta: -0.002 },
  { domain: 'prweek.com',          type: 'Editorial' as const,     retrieved:  74, retrievedDelta:  12, citationRate: 0.046, citationRateDelta:  0.008 },
  { domain: 'odwyerpr.com',        type: 'Editorial' as const,     retrieved:  68, retrievedDelta:   9, citationRate: 0.042, citationRateDelta:  0.006 },
]

const TRACKED_PROMPTS = [
  { text: 'best marketing agencies for AI companies',       sources: [], visibility: 47.2, sov: 21.3, position: 1.8, group: 'Discovery' },
  { text: 'top PR firms for tech startups',                 sources: [], visibility: 44.6, sov: 19.8, position: 2.1, group: 'Discovery' },
  { text: 'best brand strategy agencies',                   sources: [], visibility: 41.3, sov: 17.2, position: 2.4, group: 'Discovery' },
  { text: 'leading AI marketing platforms',                 sources: [], visibility: 38.7, sov: 14.9, position: 2.8, group: 'Comparison' },
  { text: 'how to do PR for a B2B SaaS company',           sources: [], visibility: 32.4, sov: 11.6, position: 3.2, group: 'How-to' },
  { text: 'marketing agency vs in-house team comparison',   sources: [], visibility: 28.9, sov:  9.4, position: 3.5, group: 'Comparison' },
]

const LLM_BREAKDOWN = [
  { model: 'ChatGPT',    visibility: 48.2, sov: 22.4, position: 1.9, ownDomainRetrieved: 47 },
  { model: 'Claude',     visibility: 44.7, sov: 19.8, position: 2.1, ownDomainRetrieved: 39 },
  { model: 'Perplexity', visibility: 41.3, sov: 17.5, position: 2.4, ownDomainRetrieved: 31 },
  { model: 'Gemini',     visibility: 37.8, sov: 15.2, position: 2.7, ownDomainRetrieved: 24 },
  { model: 'Copilot',    visibility: 34.6, sov: 13.1, position: 3.0, ownDomainRetrieved: 19 },
]

const DOMAIN_TYPES = [
  { type: 'Editorial',     percentage: 38 },
  { type: 'UGC',           percentage: 22 },
  { type: 'Own',           percentage: 14 },
  { type: 'Corporate',     percentage: 11 },
  { type: 'Reference',     percentage:  8 },
  { type: 'Institutional', percentage:  4 },
  { type: 'Competitor',    percentage:  3 },
]

export function sampleProfoundOverview(): ProfoundOverview {
  return {
    weeklyVisibility:           WEEKLY_VISIBILITY,
    competitorWeeklyVisibility: COMPETITOR_WEEKLY,
    dailyVisibility:            dailyFromWeekly(WEEKLY_VISIBILITY),
    competitorDailyVisibility:  dailyFromWeekly(COMPETITOR_WEEKLY),
    periodChange: {
      visibilityMover: { label: 'Praytell', delta: 3.8 },
      domainMover:     { label: 'forbes.com', delta: 4.2 },
      competitorShift: { label: 'BCW', delta: 2.4 },
      promptOpportunity: { text: 'marketing agency vs in-house team comparison', visibility: 28.9 },
    },
    competitorAverages: {
      visibility: 32.1,
      sov:        12.8,
      sentiment:  0,
      position:   3.1,
    },
    brandRankings:        BRANDS,
    topDomains:           TOP_DOMAINS,
    totalCitations:       1583,
    domainTypes:   DOMAIN_TYPES,
    trackedPrompts: TRACKED_PROMPTS.map((p) => ({ ...p, topicSource: 'inferred' as const })),
    llmBreakdown:  LLM_BREAKDOWN,
  }
}
