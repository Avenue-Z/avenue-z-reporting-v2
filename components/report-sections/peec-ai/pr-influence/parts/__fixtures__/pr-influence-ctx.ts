import type { PrInfluenceCtx } from '../../ctx'

export const FIXTURE_PR_INFLUENCE_CTX: PrInfluenceCtx = {
  clientSlug: 'fixture',           // not 'avenue-z' -> sentiment part renders null
  dateRange: 'last_30_days',
  models: null,
  synopsisContext: {
    aiVisibility: 55, aiVisibilityDelta: 4, avgAiPosition: 2.1, avgAiPositionDelta: -0.3,
    totalAiCitations: 1200, totalPlacements: 8, placementsCitedByAI: 5,
    aiReferralSessions: 340, aiReferralSessionsDelta: 12, totalEditorialDomains: 6,
    brandAbsentCount: 3,
    topBrandAbsentDomains: [{ domain: 'example.com', citationCount: 40 }],
    topOpportunityClusters: [{ cluster: 'Pricing', score: 72 }],
  },
  matchback: {
    rows: [
      { outlet: 'Example News', headline: 'Brand in the news', link: 'https://example.com/a', publicationDate: '2025-06-01', citedByAI: true, aiEnginesCiting: ['ChatGPT'] },
    ],
    citedCount: 1,
    totalPlacements: 8,
  },
  totalPlacements: 8,
  topEditorialRows: [
    { domain: 'example.com', citationCount: 42, citationCountDelta: 3, promptCoverage: 25, avgCitations: 1.4, hasPR: true },
  ],
  opportunityTableRows: [
    { cluster: 'Pricing', count: 5, editorialCitationDensity: 60, brandCitationRate: 55, brandMentionRate: 55, competitorPresence: 30, opportunityScore: 72 },
  ],
  brandAbsentTableRows: [
    { domain: 'rival.com', articleTitle: 'A competitor piece', articleUrl: 'https://rival.com/x', citationShare: 12, citationShareDelta: 2, competitorsMentioned: 'Rival' },
  ],
  hasEditorialDomains: true,
}
