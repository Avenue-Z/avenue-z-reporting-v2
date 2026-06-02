/**
 * Sample ContentCalendarData for demo mode. Used when ?demo=1 is on the
 * URL AND the real fetch returned null (no contentCalendarSheetId
 * configured) or errored.
 */
import type { ContentCalendarData, ContentCalendarRow } from '@/lib/content-calendar/types'

const ROWS: ContentCalendarRow[] = [
  { topic: 'AEO Strategy Guide 2026',                       url: '/blog/aeo-strategy-2026',                 contentType: 'Pillar Page', status: 'Live',     contentAction: 'new',       publishDate: '2026-05-18', updateDate: null,         matchStatus: 'matched',   aiCitations: 47, aiBotVisits: 1283 },
  { topic: 'How AI Search Is Reshaping Brand Visibility',    url: '/blog/ai-search-brand-visibility',        contentType: 'Article',     status: 'Live',     contentAction: 'new',       publishDate: '2026-05-12', updateDate: null,         matchStatus: 'matched',   aiCitations: 38, aiBotVisits:  942 },
  { topic: 'PR Strategy for the AI Era',                    url: '/blog/pr-strategy-ai-era',                contentType: 'Article',     status: 'Live',     contentAction: 'new',       publishDate: '2026-05-04', updateDate: null,         matchStatus: 'matched',   aiCitations: 29, aiBotVisits:  771 },
  { topic: 'AI Marketing Maturity Model',                   url: '/research/ai-marketing-maturity',         contentType: 'Research',    status: 'Live',     contentAction: 'new',       publishDate: '2026-04-22', updateDate: null,         matchStatus: 'matched',   aiCitations: 52, aiBotVisits: 1614 },
  { topic: 'Brand Authority Scoring Methodology',            url: '/methodology/brand-authority',            contentType: 'Methodology', status: 'Live',     contentAction: 'new',       publishDate: '2026-04-15', updateDate: null,         matchStatus: 'matched',   aiCitations: 18, aiBotVisits:  524 },
  { topic: 'Services Overview',                              url: '/services',                                contentType: 'Page',        status: 'Live',     contentAction: 'optimized', publishDate: '2024-09-12', updateDate: '2026-04-08', matchStatus: 'matched',   aiCitations: 24, aiBotVisits:  827 },
  { topic: 'About Avenue Z',                                 url: '/about',                                  contentType: 'Page',        status: 'Live',     contentAction: 'optimized', publishDate: '2024-09-12', updateDate: '2026-03-31', matchStatus: 'matched',   aiCitations: 31, aiBotVisits: 1042 },
  { topic: 'Case Study: Renaissance Benefits',               url: '/case-studies/renaissance-benefits',      contentType: 'Case Study',  status: 'Live',     contentAction: 'new',       publishDate: '2026-03-28', updateDate: null,         matchStatus: 'matched',   aiCitations: 14, aiBotVisits:  392 },
  { topic: 'Case Study: B2B SaaS AEO Lift',                  url: '/case-studies/b2b-saas-aeo',              contentType: 'Case Study',  status: 'Live',     contentAction: 'new',       publishDate: '2026-03-19', updateDate: null,         matchStatus: 'matched',   aiCitations: 21, aiBotVisits:  588 },
  { topic: 'Generative Engine Optimization Glossary',        url: '/resources/geo-glossary',                 contentType: 'Resource',    status: 'Live',     contentAction: 'new',       publishDate: '2026-03-08', updateDate: null,         matchStatus: 'matched',   aiCitations: 36, aiBotVisits:  983 },
  { topic: 'How to Audit Your Brand in ChatGPT',             url: '/blog/audit-brand-chatgpt',               contentType: 'Article',     status: 'Live',     contentAction: 'new',       publishDate: '2026-02-26', updateDate: null,         matchStatus: 'matched',   aiCitations: 19, aiBotVisits:  447 },
  { topic: 'Press: Avenue Z Featured in TechCrunch',         url: '/press/techcrunch-feature',               contentType: 'Press',       status: 'Live',     contentAction: 'new',       publishDate: '2026-02-18', updateDate: null,         matchStatus: 'matched',   aiCitations:  9, aiBotVisits:  213 },
  { topic: 'AEO for Healthcare Marketers',                   url: '/blog/aeo-healthcare',                    contentType: 'Article',     status: 'Draft',    contentAction: 'new',       publishDate: null,         updateDate: null,         matchStatus: 'unpublished', aiCitations: null, aiBotVisits: null },
  { topic: 'AI Visibility Benchmarks Q3 2026',               url: null,                                       contentType: 'Research',    status: 'Planned',  contentAction: 'new',       publishDate: '2026-06-10', updateDate: null,         matchStatus: 'unpublished', aiCitations: null, aiBotVisits: null },
  { topic: 'Pricing Page Revamp',                            url: '/pricing',                                contentType: 'Page',        status: 'Live',     contentAction: 'optimized', publishDate: '2025-01-22', updateDate: '2026-02-04', matchStatus: 'matched',   aiCitations:  6, aiBotVisits:  274 },
]

export function sampleContentCalendarData(): ContentCalendarData {
  const plannedCount   = ROWS.length
  const liveCount      = ROWS.filter((r) => r.matchStatus === 'matched').length
  const newCount       = ROWS.filter((r) => r.contentAction === 'new').length
  const optimizedCount = ROWS.filter((r) => r.contentAction === 'optimized').length
  const unmatchedCount = ROWS.filter((r) => r.matchStatus !== 'matched').length
  return { rows: ROWS, plannedCount, liveCount, newCount, optimizedCount, unmatchedCount }
}
