/**
 * Sample GA4 page-level rows that match the URLs in
 * lib/demo-data/content-calendar.ts. Used when calendarIsDemo is on so
 * the Content Impact Tracker page can populate per-row metrics
 * (Sessions, Users, Views, Engagement Rate) and the derived aggregates
 * downstream — instead of showing "--" for every row.
 *
 * Each pagePath is one of the sample calendar URLs. Numbers are
 * realistic-but-conservative for a B2B marketing agency content
 * library — high engagement rates, modest absolute traffic, top pages
 * peaking in the low thousands of sessions per 30 days.
 */
import type { GA4Row } from '@/lib/ga4/types'

export const SAMPLE_GA4_CONTENT_IMPACT_ROWS: GA4Row[] = [
  { pagePath: '/blog/aeo-strategy-2026',            sessions: 1283, activeUsers: 1042, screenPageViews: 1547, engagementRate: 0.78 },
  { pagePath: '/blog/ai-search-brand-visibility',   sessions:  942, activeUsers:  814, screenPageViews: 1156, engagementRate: 0.72 },
  { pagePath: '/blog/pr-strategy-ai-era',           sessions:  771, activeUsers:  651, screenPageViews:  938, engagementRate: 0.69 },
  { pagePath: '/research/ai-marketing-maturity',    sessions: 1614, activeUsers: 1389, screenPageViews: 2087, engagementRate: 0.81 },
  { pagePath: '/methodology/brand-authority',       sessions:  524, activeUsers:  441, screenPageViews:  636, engagementRate: 0.66 },
  { pagePath: '/services',                          sessions:  827, activeUsers:  694, screenPageViews:  989, engagementRate: 0.74 },
  { pagePath: '/about',                             sessions: 1042, activeUsers:  883, screenPageViews: 1278, engagementRate: 0.71 },
  { pagePath: '/case-studies/renaissance-benefits', sessions:  392, activeUsers:  328, screenPageViews:  461, engagementRate: 0.68 },
  { pagePath: '/case-studies/b2b-saas-aeo',         sessions:  588, activeUsers:  497, screenPageViews:  712, engagementRate: 0.73 },
  { pagePath: '/resources/geo-glossary',            sessions:  983, activeUsers:  831, screenPageViews: 1197, engagementRate: 0.76 },
  { pagePath: '/blog/audit-brand-chatgpt',          sessions:  447, activeUsers:  374, screenPageViews:  524, engagementRate: 0.65 },
  { pagePath: '/press/techcrunch-feature',          sessions:  213, activeUsers:  187, screenPageViews:  249, engagementRate: 0.58 },
  { pagePath: '/pricing',                           sessions:  274, activeUsers:  234, screenPageViews:  319, engagementRate: 0.62 },
  // Draft + Planned rows intentionally have no GA4 data (URL is null or
  // unpublished — there's nothing for GA4 to measure). Omitted from the
  // sample rows; the join in content-impact returns null and the table
  // shows "--" for those, which is correct behaviour.
]
