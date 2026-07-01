// Fixture context for golden/parity tests. All fields are fake/representative;
// data is chosen to exercise meaningful branches in every part:
// - non-empty dailyVisibility (visibility-chart renders)
// - a 'you' brand present (kpi-cards renders, not skipped)
// - non-empty llmBreakdown (llm-breakdown renders)
// - winners and losers present (winners-losers renders content)
// - aiTraffic.available = true with sessions > 0
// - non-empty topDomains + domainTypes (domains-row renders)
// - non-empty brandRankings (brand-rankings renders)

import type { PeecCtx } from '../../ctx'
import { BrandRankingsTable } from '../../brand-rankings-table'
import { TopDomainsTable } from '../../top-domains-table'
import { LLMBreakdownTable } from '../../llm-breakdown-table'
import { PEEC } from '@/lib/peec/metric-definitions'

export const FIXTURE_PEEC_CTX: PeecCtx = {
  data: {
    weeklyVisibility: [
      { weekStart: '2025-06-02', weekLabel: 'Jun 2', visibility: 42 },
      { weekStart: '2025-06-09', weekLabel: 'Jun 9', visibility: 47 },
      { weekStart: '2025-06-16', weekLabel: 'Jun 16', visibility: 51 },
      { weekStart: '2025-06-23', weekLabel: 'Jun 23', visibility: 55 },
    ],
    competitorWeeklyVisibility: [
      { weekStart: '2025-06-02', weekLabel: 'Jun 2', visibility: 30 },
      { weekStart: '2025-06-09', weekLabel: 'Jun 9', visibility: 32 },
      { weekStart: '2025-06-16', weekLabel: 'Jun 16', visibility: 33 },
      { weekStart: '2025-06-23', weekLabel: 'Jun 23', visibility: 35 },
    ],
    dailyVisibility: [
      { date: '2025-06-01', visibility: 40 },
      { date: '2025-06-02', visibility: 42 },
      { date: '2025-06-03', visibility: 43 },
      { date: '2025-06-04', visibility: 45 },
      { date: '2025-06-05', visibility: 48 },
    ],
    competitorDailyVisibility: [
      { date: '2025-06-01', visibility: 29 },
      { date: '2025-06-02', visibility: 30 },
      { date: '2025-06-03', visibility: 31 },
      { date: '2025-06-04', visibility: 32 },
      { date: '2025-06-05', visibility: 33 },
    ],
    competitorAverages: { visibility: 32.5, sov: 18.2, sentiment: 0.7, position: 4.1 },
    brandRankings: [
      {
        rank: 1,
        name: 'Acme Corp',
        visibility: 55.2,
        visibilityDelta: 3.1,
        sov: 28.4,
        sovDelta: 1.2,
        sentiment: 0.85,
        sentimentDelta: 0.05,
        position: 2.1,
        positionDelta: -0.3,
        isYou: true,
      },
      {
        rank: 2,
        name: 'Rival Inc',
        visibility: 38.7,
        visibilityDelta: -1.5,
        sov: 20.1,
        sovDelta: -0.8,
        sentiment: 0.72,
        sentimentDelta: 0.02,
        position: 3.5,
        positionDelta: 0.4,
        isYou: false,
      },
      {
        rank: 3,
        name: 'Beta LLC',
        visibility: 26.3,
        visibilityDelta: 0.9,
        sov: 14.6,
        sovDelta: 0.5,
        sentiment: 0.65,
        sentimentDelta: -0.01,
        position: 5.2,
        positionDelta: -0.1,
        isYou: false,
      },
    ],
    topDomains: [
      { domain: 'acme.com', retrieved: 72.4, retrievedDelta: 4.2, citationRate: 18.5, citationRateDelta: 1.1, citationCount: 340, priorCitationCount: 300, type: 'Own' },
      { domain: 'techcrunch.com', retrieved: 61.0, retrievedDelta: 2.8, citationRate: 12.0, citationRateDelta: 0.5, citationCount: 220, priorCitationCount: 200, type: 'Editorial' },
      { domain: 'reddit.com', retrieved: 55.3, retrievedDelta: -1.2, citationRate: 8.4, citationRateDelta: -0.3, citationCount: 155, priorCitationCount: 165, type: 'UGC' },
      { domain: 'rival.com', retrieved: 48.9, retrievedDelta: 0.6, citationRate: 7.0, citationRateDelta: 0.2, citationCount: 128, priorCitationCount: 124, type: 'Competitor' },
      { domain: 'wikipedia.org', retrieved: 44.2, retrievedDelta: 1.0, citationRate: 5.5, citationRateDelta: 0.1, citationCount: 100, priorCitationCount: 98, type: 'Reference' },
    ],
    totalCitations: 943,
    yourBrandCitations: 340,
    yourBrandCitationsPrior: 300,
    totalCitationsPrior: 887,
    domainTypes: [
      { type: 'Editorial', percentage: 38 },
      { type: 'Corporate', percentage: 22 },
      { type: 'UGC', percentage: 18 },
      { type: 'Competitor', percentage: 12 },
      { type: 'Own', percentage: 7 },
      { type: 'Reference', percentage: 3 },
    ],
    trackedPrompts: [
      {
        text: 'best digital marketing agency 2025',
        sources: ['ChatGPT', 'Perplexity'],
        visibility: 65.0,
        sov: 22.0,
        position: 2.5,
        positionByModel: { ChatGPT: 2.0, Perplexity: 3.0 },
        priorPositionByModel: { ChatGPT: 5.0, Perplexity: 6.0 },
        group: 'Agency Selection',
        topicSource: 'provider',
      },
      {
        text: 'top pr firms for tech startups',
        sources: ['ChatGPT', 'Gemini'],
        visibility: 48.0,
        sov: 15.0,
        position: 4.1,
        positionByModel: { ChatGPT: 4.0, Gemini: 4.2 },
        priorPositionByModel: { ChatGPT: 2.0, Gemini: 2.5 },
        group: 'PR & Communications',
        topicSource: 'provider',
      },
    ],
    llmBreakdown: [
      { model: 'ChatGPT', visibility: 60.1, sov: 25.3, position: 2.4, ownDomainRetrieved: 70.5 },
      { model: 'Perplexity', visibility: 52.7, sov: 20.1, position: 3.1, ownDomainRetrieved: 65.2 },
      { model: 'Gemini', visibility: 44.3, sov: 17.8, position: 3.8, ownDomainRetrieved: 58.9 },
    ],
    domainCitationsByModel: {
      'acme.com': { ChatGPT: 180, Perplexity: 100, Gemini: 60 },
    },
    brandVisibilityByModel: {
      'Acme Corp': { ChatGPT: 60.1, Perplexity: 52.7, Gemini: 44.3 },
    },
    totalCitationsByModel: { ChatGPT: 450, Perplexity: 280, Gemini: 213 },
    yourBrandCitationsByModel: { ChatGPT: 180, Perplexity: 100, Gemini: 60 },
    periodChange: {
      visibilityMover: { label: 'Acme Corp', delta: 3.1 },
      domainMover: { label: 'acme.com', delta: 4.2 },
      competitorShift: { label: 'Rival Inc', delta: -1.5 },
      promptOpportunity: { text: 'best digital marketing agency 2025', visibility: 65.0 },
    },
  },
  provider: 'peec',
  aiTraffic: {
    available: true,
    sessions: 1240,
    sessionsPrior: 980,
  },
  clientSlug: 'fixture-client',
  dateRange: 'last_30_days',
  isPeec: true,
  you: {
    rank: 1,
    name: 'Acme Corp',
    visibility: 55.2,
    visibilityDelta: 3.1,
    sov: 28.4,
    sovDelta: 1.2,
    sentiment: 0.85,
    sentimentDelta: 0.05,
    position: 2.1,
    positionDelta: -0.3,
    isYou: true,
  },
  modelActive: false,
  llmFiltered: [
    { model: 'ChatGPT', visibility: 60.1, sov: 25.3, position: 2.4, ownDomainRetrieved: 70.5 },
    { model: 'Perplexity', visibility: 52.7, sov: 20.1, position: 3.1, ownDomainRetrieved: 65.2 },
    { model: 'Gemini', visibility: 44.3, sov: 17.8, position: 3.8, ownDomainRetrieved: 58.9 },
  ],
  visFiltered: null,
  brandName: 'Acme Corp',
  Rankings: BrandRankingsTable,
  Domains: TopDomainsTable,
  LLM: LLMBreakdownTable,
  DEF: PEEC,
  label: 'Peec AI',
  citationShareValue: 36.1,
  citationShareDeltaShown: 2.4,
  citShareNumer: 340,
  citShareDenom: 943,
  aiTrafficDelta: 26.5,
  winners: [
    { text: 'best digital marketing agency 2025', rank: 2, delta: 3 },
  ],
  losers: [
    { text: 'top pr firms for tech startups', rank: 4, delta: -2 },
  ],
}
