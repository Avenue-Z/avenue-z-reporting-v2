/**
 * Sample AgentAnalyticsData for demo mode. Used when demoMode is on AND
 * the real Peec agent-analytics fetch returned null/empty. Powers both
 * Content Impact (Sections G-3, I) and Technical Audit (Sections C, D,
 * E, F) so the demo shows realistic AI bot crawl behavior across the
 * report.
 */
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'

const TOP_PATHS = [
  { path: '/services',                          visits: 412, status: 200 },
  { path: '/about',                             visits: 387, status: 200 },
  { path: '/methodology/brand-authority',       visits: 341, status: 200 },
  { path: '/resources/geo-glossary',            visits: 318, status: 200 },
  { path: '/blog/audit-brand-chatgpt',          visits: 276, status: 200 },
  { path: '/case-studies/renaissance-benefits', visits: 234, status: 200 },
  { path: '/press/techcrunch-feature',          visits: 189, status: 200 },
  { path: '/pricing',                           visits: 156, status: 200 },
  { path: '/services/aeo',                      visits: 142, status: 200 },
  { path: '/insights/2026-ai-trends',           visits: 128, status: 200 },
  { path: '/blog/llm-citation-patterns',        visits:  94, status: 301 },
  { path: '/old/branding-services',             visits:  47, status: 404 },
]

const BOTS = [
  { botId: 'OAI-SearchBot', botName: 'OpenAI SearchBot', provider: 'OpenAI',     botType: 'search',    totalVisits: 612, uniquePages:  84, successRate: 0.94, lastSeen: '2026-06-01T14:23:17Z' },
  { botId: 'GPTBot',        botName: 'GPTBot',           provider: 'OpenAI',     botType: 'training',  totalVisits: 487, uniquePages:  72, successRate: 0.91, lastSeen: '2026-06-01T11:42:08Z' },
  { botId: 'ClaudeBot',     botName: 'Claude (Crawler)', provider: 'Anthropic',  botType: 'training',  totalVisits: 423, uniquePages:  68, successRate: 0.96, lastSeen: '2026-06-02T03:18:54Z' },
  { botId: 'PerplexityBot', botName: 'PerplexityBot',    provider: 'Perplexity', botType: 'retrieval', totalVisits: 356, uniquePages:  61, successRate: 0.89, lastSeen: '2026-06-02T08:51:30Z' },
  { botId: 'Google-Extended', botName: 'Google-Extended', provider: 'Google',    botType: 'training',  totalVisits: 287, uniquePages:  54, successRate: 0.93, lastSeen: '2026-06-01T19:07:42Z' },
  { botId: 'Claude-User',   botName: 'Claude (User)',    provider: 'Anthropic',  botType: 'retrieval', totalVisits: 198, uniquePages:  43, successRate: 0.97, lastSeen: '2026-06-02T10:34:11Z' },
]

export function sampleAgentAnalytics(): AgentAnalyticsData {
  const totalBotVisits = BOTS.reduce((s, b) => s + b.totalVisits, 0)
  const visitsByBot = Object.fromEntries(BOTS.map(b => [b.botId, b.totalVisits]))
  return {
    bots: BOTS,
    topPaths: TOP_PATHS,
    totalBotVisits,
    uniquePagesVisited: 94,
    errorPageHits: 53,
    redirectHits: 71,
    robotsTxtHits: 18,
    highValuePageBotHits: 1842,
    visitsByBot,
    window: { startDate: '2026-05-03', endDate: '2026-06-02' },
    byPath: {},
  }
}
