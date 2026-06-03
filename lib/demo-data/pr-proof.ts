/**
 * Sample PRProofData for demo mode. Used when demoMode is on AND the
 * real pr-proof fetch returned empty or errored.
 */
import type { PRProofData, PRPlacement } from '@/lib/pr-proof/types'

const PLACEMENTS: PRPlacement[] = [
  { client: 'Avenue Z', outlet: 'TechCrunch',         headline: 'How Avenue Z is rewiring marketing for the AI era',                       publicationDate: '2026-05-22', link: 'https://techcrunch.com/2026/05/22/avenue-z-ai-marketing',           domain: 'techcrunch.com',         impact: 'Tier 1', dateAdded: '2026-05-23' },
  { client: 'Avenue Z', outlet: 'Forbes',             headline: 'Inside the agency model bringing AI visibility to enterprise brands',     publicationDate: '2026-05-18', link: 'https://forbes.com/sites/avenue-z-ai-visibility',                   domain: 'forbes.com',             impact: 'Tier 1', dateAdded: '2026-05-19' },
  { client: 'Avenue Z', outlet: 'AdAge',              headline: 'AEO is the new SEO: agency execs explain what changes',                  publicationDate: '2026-05-12', link: 'https://adage.com/article/aeo-new-seo-agency-execs',                domain: 'adage.com',              impact: 'Tier 2', dateAdded: '2026-05-13' },
  { client: 'Avenue Z', outlet: 'PRWeek',             headline: 'Q1 PR awards: Avenue Z named agency of the year',                        publicationDate: '2026-05-08', link: 'https://prweek.com/article/q1-pr-awards-avenue-z',                  domain: 'prweek.com',             impact: 'Tier 1', dateAdded: '2026-05-09' },
  { client: 'Avenue Z', outlet: 'AdWeek',             headline: 'Five marketing agencies pioneering AI-first creative',                   publicationDate: '2026-05-02', link: 'https://adweek.com/agencies/five-pioneers-ai-first',                domain: 'adweek.com',             impact: 'Tier 2', dateAdded: '2026-05-03' },
  { client: 'Avenue Z', outlet: 'Wall Street Journal',headline: 'How marketing leaders are rebuilding their teams around AI',             publicationDate: '2026-04-28', link: 'https://wsj.com/articles/marketing-teams-rebuilding-ai',            domain: 'wsj.com',                impact: 'Tier 1', dateAdded: '2026-04-29' },
  { client: 'Avenue Z', outlet: "O'Dwyer's PR",        headline: 'PR firm of the month: Avenue Z',                                         publicationDate: '2026-04-22', link: 'https://odwyerpr.com/story/avenue-z-firm-of-the-month',             domain: 'odwyerpr.com',           impact: 'Tier 2', dateAdded: '2026-04-23' },
  { client: 'Avenue Z', outlet: 'Marketing Brew',     headline: 'The agencies showing up most in ChatGPT and Perplexity right now',       publicationDate: '2026-04-15', link: 'https://marketingbrew.com/stories/agencies-chatgpt-perplexity',     domain: 'marketingbrew.com',      impact: 'Tier 2', dateAdded: '2026-04-16' },
  { client: 'Avenue Z', outlet: 'Fast Company',       headline: "How AI is changing what 'creative agency' means",                        publicationDate: '2026-04-09', link: 'https://fastcompany.com/article/ai-creative-agency-redefined',     domain: 'fastcompany.com',        impact: 'Tier 1', dateAdded: '2026-04-10' },
  { client: 'Avenue Z', outlet: 'The Drum',           headline: 'Founder spotlight: building an AI-native marketing agency',              publicationDate: '2026-03-31', link: 'https://thedrum.com/news/founder-spotlight-avenue-z',               domain: 'thedrum.com',            impact: 'Tier 2', dateAdded: '2026-04-01' },
  { client: 'Avenue Z', outlet: 'CMO Magazine',       headline: '2026 CMO trends: AEO, audience intelligence, and integrated ops',        publicationDate: '2026-03-24', link: 'https://cmomagazine.com/2026-trends-aeo-intelligence',              domain: 'cmomagazine.com',        impact: 'Tier 2', dateAdded: '2026-03-25' },
  { client: 'Avenue Z', outlet: 'Business Insider',   headline: 'The boutique agency landing Fortune 500 work without a traditional pitch', publicationDate: '2026-03-15', link: 'https://businessinsider.com/avenue-z-fortune-500',                  domain: 'businessinsider.com',    impact: 'Tier 1', dateAdded: '2026-03-16' },
]

export function samplePRProofData(): PRProofData {
  const sorted = [...PLACEMENTS].sort((a, b) =>
    new Date(b.publicationDate).getTime() - new Date(a.publicationDate).getTime()
  )
  return {
    placements:      sorted,
    totalPlacements: sorted.length,
    uniqueOutlets:   new Set(sorted.map((p) => p.outlet)).size,
    uniqueDomains:   Array.from(new Set(sorted.map((p) => p.domain))),
    dateRange: {
      earliest: sorted[sorted.length - 1].publicationDate,
      latest:   sorted[0].publicationDate,
    },
  }
}
