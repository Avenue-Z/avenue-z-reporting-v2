import { Suspense } from 'react'
import { FileText, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { SectionHeader } from './section-header'
import { ContentImpactSynopsis } from './content-impact-synopsis'
import type { ContentImpactSynopsisContext } from '@/lib/peec/content-impact-synopsis'
import { cn } from '@/lib/utils'
import { getPeecOverview } from '@/lib/peec/client'
import type { TopDomain } from '@/lib/peec/client'
import { getAgentAnalytics } from '@/lib/peec/agent-analytics'
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, avgCitationsByDomain } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'
import { MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'
import { sumByModel, filterDomainRowsByModel } from '@/lib/peec/by-model'
import { getContentCalendarData } from '@/lib/content-calendar/client'
import type { ContentCalendarRow } from '@/lib/content-calendar/types'
import { sampleContentCalendarData } from '@/lib/demo-data/content-calendar'
import { sampleAgentAnalytics } from '@/lib/demo-data/agent-analytics'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SAMPLE_GA4_CONTENT_IMPACT_ROWS } from '@/lib/demo-data/ga4-content-impact'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query } from '@/lib/ga4/client'
import { isAiSource } from '@/lib/constants'
import { median, computeUrlTiming } from '@/lib/ga4/content-derive'
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
} from './content-impact-tables'

// ---------------------------------------------------------------------------
// Content Impact Tracker
// PRD Sections A-J -- full spec implementation
//
// Live data (always):     Peec AI (brand visibility, citations, editorial domains)
//                         Peec Agent Analytics (AI bot crawl data)
// Live data (per-client): Content Calendar Google Sheet (when contentCalendarSheetId set)
// Pending per-client:     GA4 page-level sessions, GSC
//
// Content calendar unlocks Sections A (KPI counts), B (content performance
// table), D (new vs optimized lift), and Section J (richer recommendations).
// ---------------------------------------------------------------------------

// ─── UI atoms ─────────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  live = false,
}: {
  label: string
  value: string
  hint: string
  live?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-bg-surface p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className={cn('text-xl font-bold tabular-nums', live ? 'text-white' : 'text-white/20')}>{value}</span>
      <span className="text-[10px] text-text-muted">{hint}</span>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted last:pr-0">
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('py-2.5 pr-5 text-xs last:pr-0', className)}>
      {children}
    </td>
  )
}

// ─── Cross-reference helpers ───────────────────────────────────────────────────

/** Extract path from a URL for agent analytics matching */
function extractPath(url: string | null): string | null {
  if (!url) return null
  try { return new URL(url).pathname } catch { return url.startsWith('/') ? url : null }
}

/** Check if a content calendar URL has AI bot visits (Section B enrichment) */
function getAiBotVisits(
  url: string | null,
  agentData: AgentAnalyticsData | null
): number | null {
  if (!url || !agentData) return null
  const path = extractPath(url)
  if (!path) return null
  const match = agentData.topPaths.find(p => p.path === path || p.path === path.replace(/\/$/, ''))
  return match?.visits ?? 0
}

/** Look up GA4 page metrics for a content calendar URL */
function getGA4Metrics(
  url: string | null,
  ga4Rows: import('@/lib/ga4/types').GA4Row[] | null
): { sessions: number | null; users: number | null; views: number | null; engagementRate: number | null } {
  const empty = { sessions: null, users: null, views: null, engagementRate: null }
  if (!url || !ga4Rows) return empty
  const path = extractPath(url)
  if (!path) return empty
  const row = ga4Rows.find(r => {
    const p = String(r.pagePath ?? '')
    return p === path || p === path.replace(/\/$/, '') || path === p.replace(/\/$/, '')
  })
  if (!row) return empty
  return {
    sessions:       row.sessions       !== null ? Number(row.sessions)       : null,
    users:          row.activeUsers     !== null ? Number(row.activeUsers)    : null,
    views:          row.screenPageViews !== null ? Number(row.screenPageViews): null,
    engagementRate: row.engagementRate  !== null ? Number(row.engagementRate) : null,
  }
}

/** Derive a recommended next action from available signals */
function deriveAction(row: ContentCalendarRow, hasBotVisits: boolean): string {
  if (row.matchStatus === 'unpublished') return 'Publish and monitor for AI indexing'
  if (row.matchStatus === 'redirected') return 'Update internal links to final destination'
  if (hasBotVisits && !row.aiCitations) return 'AI bots crawling but not citing -- check content format'
  if (row.aiCitations && row.aiCitations > 0) return 'Cited in AI -- protect and expand coverage'
  return 'No AI citations or crawls yet -- monitor and strengthen on-page signals'
}

// ─── Main async RSC ──────────────────────────────────────────────────────────

// ── Bot-ID → AEOModel mapping ─────────────────────────────────────────────────
// Maps Peec agent-analytics bot_id values (from STATIC_BOT_NAMES in
// agent-analytics.ts and demo-data/agent-analytics.ts) to AEOModel.
//
// OAI-SearchBot / GPTBot  → ChatGPT   (both are OpenAI crawlers)
// ClaudeBot / Claude-User → Claude    (Anthropic training + retrieval bots)
// PerplexityBot           → Perplexity
// Google-Extended         → Gemini    (Google's generative-AI training bot)
// Bingbot / Bingbot-Video → Copilot   (Microsoft Bing powers Copilot)
//
// CCBot (Common Crawl), Applebot, Ai2Bot, Amazonbot, Bytespider,
// DuckDuckBot, meta-externalagent: not mapped — no single AEOModel owns these.
// When `models` filter is active, unmapped bots are dropped from filtered view.
const BOT_TO_MODEL: Record<string, AEOModel> = {
  'OAI-SearchBot':  'ChatGPT',
  'GPTBot':         'ChatGPT',
  'Claude-User':    'Claude',
  'ClaudeBot':      'Claude',
  'PerplexityBot':  'Perplexity',
  'Google-Extended':'Gemini',
  'Googlebot':      'Google',
  'Bingbot':        'Copilot',
  'Bingbot-Video':  'Copilot',
}

export async function ContentImpactReport({
  clientSlug,
  dateRange,
  demoMode = false,
  models,
}: {
  clientSlug: string
  dateRange?: string
  demoMode?: boolean
  models?: AEOModel[] | null
}) {
  const effectiveRange = dateRange ?? 'last_30_days'

  const [peecResult, agentResult, calendarResult, ga4Result, urlCitationsResult, coverageResult, ga4AiHostResult, ga4AiPathResult] = await Promise.allSettled([
    getPeecOverview(clientSlug, effectiveRange),  // multi-client: uses peecCustomerProjectId from config; honors the page date range
    getAgentAnalytics(clientSlug),
    getContentCalendarData(clientSlug), // null when contentCalendarSheetId not configured
    ga4Query({                          // page-level sessions for Section B -- requires ga4PropertyId
      clientSlug,
      dateRange: effectiveRange,
      metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
      dimensions: ['pagePath'],
      limit: 1000,
    }),
    getUrlCitations(clientSlug),
    getDomainCoverage(clientSlug),      // per-domain prompt/theme coverage (Section H)
    ga4Query({                          // §A totals + §F per-host AI-referred sessions
      clientSlug,
      dateRange: effectiveRange,
      metrics: ['sessions'],
      dimensions: ['hostName', 'sessionSource'],
      limit: 1000,
    }),
    ga4Query({                          // §B per-path AI-referred sessions (all engines)
      clientSlug,
      dateRange: effectiveRange,
      metrics: ['sessions'],
      dimensions: ['pagePath', 'sessionSource'],
      limit: 2000,
    }),
  ])

  let peecData     = peecResult.status     === 'fulfilled' ? peecResult.value     : null
  let agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null
  let calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : null
  let ga4Rows      = ga4Result.status      === 'fulfilled' ? ga4Result.value.rows : null
  let urlCitations = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
  let coverage     = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, tagNameById: {} }
  const citationsOk = urlCitationsResult.status === 'fulfilled'
  // GA4 host×source rows (§A totals + §F per-host AI-referred). null when the
  // query rejected (GA4 unconfigured / property not shared) → callers reserve
  // -- for that case, 0 stays 0.
  const ga4AiHostRows = ga4AiHostResult.status === 'fulfilled' ? ga4AiHostResult.value.rows : null
  const ga4AiPathRows = ga4AiPathResult.status === 'fulfilled' ? ga4AiPathResult.value.rows : null

  // Demo mode: force-substitute every data source so the demo is
  // exclusively synthetic — no mixing of real client data with sample
  // data. `calendarIsDemo` is retained as the boolean some downstream
  // render paths read, but it now equals `demoMode` (no empty guard).
  const calendarIsDemo = demoMode
  if (demoMode) {
    peecData     = samplePeecOverview()
    agentData    = sampleAgentAnalytics()
    calendarData = sampleContentCalendarData()
    ga4Rows      = SAMPLE_GA4_CONTENT_IMPACT_ROWS
    urlCitations = []   // demo: §B/§F/§H use their own demo arrays
    coverage     = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, tagNameById: {} }  // demo: §H uses demo fallbacks
  }

  if (peecResult.status         === 'rejected') console.error('[content-impact] Peec error:', peecResult.reason)
  if (agentResult.status        === 'rejected') console.error('[content-impact] Agent analytics error:', agentResult.reason)
  if (calendarResult.status     === 'rejected') console.error('[content-impact] Content calendar error:', calendarResult.reason)
  if (ga4Result.status          === 'rejected') console.error('[content-impact] GA4 error:', ga4Result.reason)
  if (ga4AiHostResult.status    === 'rejected') console.error('[content-impact] GA4 host/source error:', ga4AiHostResult.reason)
  if (ga4AiPathResult.status    === 'rejected') console.error('[content-impact] GA4 path/source error:', ga4AiPathResult.reason)
  if (urlCitationsResult.status === 'rejected') console.error('[content-impact] URL citations error:', urlCitationsResult.reason)

  // ── Derived metrics ────────────────────────────────────────────────────────
  const ownDomains        = (peecData?.topDomains ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.topDomains ?? []).filter(d => d.type === 'Competitor')
  const editorialDomains  = (peecData?.topDomains ?? []).filter(d => d.type === 'Editorial')

  // ── AI Citations KPI: filtered by selected models when active ───────────────
  // When a model filter is active, sum domainCitationsByModel across selected
  // models for all domains. When no filter, use the pre-aggregated total for the
  // selected date range.
  const totalCitations = models != null && peecData?.domainCitationsByModel
    ? Object.keys(peecData.domainCitationsByModel).reduce(
        (acc, domain) => acc + sumByModel(peecData!.domainCitationsByModel, domain, models),
        0,
      )
    : (peecData?.totalCitations ?? 0)

  // ── Bot filtering by selected AI models ─────────────────────────────────────
  // When a model filter is active, keep only bots mapped to a selected model.
  // Unmapped bots (Common Crawl, Applebot, Meta AI, etc.) have no single-model
  // association and are dropped from the filtered view — v1 limitation: these
  // bots are not attributable to a specific conversational AI model.
  const allBots = agentData?.bots ?? []
  const filteredBots = models != null
    ? allBots.filter((b) => {
        const m = BOT_TO_MODEL[b.botId]
        return m != null && models.includes(m)
      })
    : allBots

  // ── Model-filtered domain lists ──────────────────────────────────────────────
  // For Peec citation tables: recompute citationCount from per-model data when
  // a filter is active. Falls back to unfiltered domain list when no filter.
  // Note: `citationRate` (the citationCount field on TopDomain) is a percentage
  // float. We treat it as citationCount for the filter helper since the shape matches.
  const filteredOwnDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        ownDomains.map(d => ({ ...d, citationCount: d.citationRate })),
        peecData.domainCitationsByModel,
        models ?? null,
      ).map(d => ({ ...d, citationRate: d.citationCount }))
    : ownDomains

  const filteredCompetitorDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        competitorDomains.map(d => ({ ...d, citationCount: d.citationRate })),
        peecData.domainCitationsByModel,
        models ?? null,
      ).map(d => ({ ...d, citationRate: d.citationCount }))
    : competitorDomains

  const filteredEditorialDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        editorialDomains.map(d => ({ ...d, citationCount: d.citationRate })),
        peecData.domainCitationsByModel,
        models ?? null,
      ).map(d => ({ ...d, citationRate: d.citationCount }))
    : editorialDomains

  // Enrich content calendar rows with agent analytics data (path matching)
  const enrichedRows: ContentCalendarRow[] = (calendarData?.rows ?? []).map(row => ({
    ...row,
    aiBotVisits: getAiBotVisits(row.url, agentData),
  }))

  const unmatchedPct = calendarData && calendarData.plannedCount > 0
    ? Math.round((calendarData.unmatchedCount / calendarData.plannedCount) * 100)
    : null

  // Prompt coverage and theme coverage per domain (PRD Section H).
  // Derived from per-URL citation data (prompt_id / tag_id dimensions) joined by
  // host — not trackedPrompts[].sources, which are AI-engine ids, never domains.
  // coverageAvailable distinguishes a known 0 (domain cited by no prompt/theme)
  // from missing data (fetch failed / unconfigured / demo) → only the former
  // shows 0; the latter stays --.
  const totalTrackedPrompts = peecData?.trackedPrompts.length ?? 0
  const coverageAvailable =
    Object.keys(coverage.promptIdsByDomain).length > 0 ||
    Object.keys(coverage.tagIdsByDomain).length > 0
  const getPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalTrackedPrompts * 100)
      : null
  const getThemeCoverage = (domain: string): number | null =>
    coverageAvailable ? domainTagIds(coverage, domain).length : null

  const citeByKey = new Map(urlCitations.map((c) => [c.urlKey, c]))

  // Citation-count-weighted avg citations-per-answer per domain (§F owned pages).
  // host key is www-stripped + lowercased to match avgCitationsByDomain()/domainTagNames().
  const hostKey = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  const avgCitByDomain = avgCitationsByDomain(urlCitations)

  // ── GA4 derivations (§A glance totals, §F per-host) ──────────────────────────
  // 0-vs-no-data rule (#35): when the query resolved, a 0 is a real 0; -- is
  // reserved for a rejected query (handled by the *Ok booleans below).
  const normPath = (p: string) => p.replace(/\/$/, '') || '/'
  const aiHostOk = ga4AiHostRows !== null

  // §A · Total Sessions — sum across all host×source rows.
  const ga4TotalSessions = aiHostOk
    ? ga4AiHostRows!.reduce((s, r) => s + (Number(r.sessions) || 0), 0)
    : null

  // §A · AI-Referred Sessions — sum across AI-source rows (all engines).
  const ga4AiReferredSessions = aiHostOk
    ? ga4AiHostRows!.filter(r => isAiSource(r.sessionSource)).reduce((s, r) => s + (Number(r.sessions) || 0), 0)
    : null

  // §F · AI-referred sessions by host + the set of hosts GA4 actually tracks
  // (so a host with 0 AI sessions shows 0, but a host GA4 doesn't cover stays --).
  const ga4Hosts = new Set<string>()
  const aiRefByHost = new Map<string, number>()
  if (aiHostOk) {
    for (const r of ga4AiHostRows!) {
      const h = hostKey(String(r.hostName ?? ''))
      if (h) ga4Hosts.add(h)
      if (isAiSource(r.sessionSource) && h) {
        aiRefByHost.set(h, (aiRefByHost.get(h) ?? 0) + (Number(r.sessions) || 0))
      }
    }
  }

  // §B · AI-referred sessions per page path (all engines). A path GA4 tracks
  // shows its real count (0 if none); a path GA4 doesn't cover stays -- (null).
  const aiPathOk = ga4AiPathRows !== null
  const aiRefByPath = new Map<string, number>()
  if (aiPathOk) {
    for (const r of ga4AiPathRows!) {
      if (!isAiSource(r.sessionSource)) continue
      const p = normPath(String(r.pagePath ?? ''))
      aiRefByPath.set(p, (aiRefByPath.get(p) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  const ga4PathSet = new Set((ga4Rows ?? []).map(r => normPath(String(r.pagePath ?? ''))))
  const aiReferredForPath = (path: string | null): number | null => {
    if (!aiPathOk || !path) return null
    const np = normPath(path)
    if (!ga4PathSet.has(np)) return null
    return aiRefByPath.get(np) ?? 0
  }

  // ── §C · time-to-first-traffic / first-AI-activity (GA4-4) ───────────────────
  // Keys off planned content (URL + publish date). One date-bucketed GA4 query,
  // restricted to the planned paths over the window from the earliest publish
  // date to today, feeds §C: days-to-first across URLs. Gated on the content
  // calendar — without publish dates there is no URL spine to measure.
  const isoDate = (s: string | null): string | null =>
    s && /^\d{4}-\d{2}-\d{2}/.test(s.trim()) ? s.trim().slice(0, 10) : null
  const plannedTiming = (calendarData?.rows ?? [])
    .map(r => ({ path: extractPath(r.url), publishDate: isoDate(r.publishDate) }))
    .filter((r): r is { path: string; publishDate: string } =>
      r.path !== null && r.publishDate !== null)

  const daysByPath = new Map<string, Map<string, { sessions: number; aiSessions: number }>>()
  let timingOk = false
  if (!demoMode && plannedTiming.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    const minPublish = plannedTiming.reduce((m, r) => (r.publishDate < m ? r.publishDate : m), plannedTiming[0].publishDate)
    // pagePath inListFilter is an exact match, but GA4 may store a path with or
    // without a trailing slash. Include both variants so neither form is missed;
    // the client-side join (normPath) collapses them back together.
    const pathVariants = (p: string) => {
      const stripped = p.replace(/\/$/, '') || '/'
      return stripped === '/' ? ['/'] : [stripped, `${stripped}/`]
    }
    const filterValues = [...new Set(plannedTiming.flatMap(r => pathVariants(r.path)))]
    try {
      const res = await ga4Query({
        clientSlug,
        dateRange: `${minPublish},${today}`,
        metrics: ['sessions'],
        dimensions: ['pagePath', 'date', 'sessionSource'],
        dimensionFilter: { filter: { fieldName: 'pagePath', inListFilter: { values: filterValues } } },
        limit: 100000,
      })
      timingOk = true
      for (const row of res.rows) {
        const path = normPath(String(row.pagePath ?? ''))
        const ds = String(row.date ?? '')
        const iso = ds.length === 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : ds
        const sessions = Number(row.sessions) || 0
        if (!daysByPath.has(path)) daysByPath.set(path, new Map())
        const byDate = daysByPath.get(path)!
        const acc = byDate.get(iso) ?? { sessions: 0, aiSessions: 0 }
        acc.sessions += sessions
        if (isAiSource(row.sessionSource)) acc.aiSessions += sessions
        byDate.set(iso, acc)
      }
    } catch (e) {
      console.error('[content-impact] GA4 §C timing error:', e)
    }
  }

  const daysFor = (path: string) =>
    [...(daysByPath.get(normPath(path))?.entries() ?? [])].map(([date, v]) => ({ date, ...v }))

  const urlTimings = plannedTiming.map(r =>
    computeUrlTiming({ publishDate: r.publishDate, days: daysFor(r.path) }),
  )

  // §C aggregates (median days-to-first; fastest/slowest AI-indexed).
  const firstTrafficDays = urlTimings.map(t => t.daysToFirstTraffic).filter((n): n is number => n !== null)
  const firstAiDays = urlTimings.map(t => t.daysToFirstAi).filter((n): n is number => n !== null)
  const medFirstTraffic = median(firstTrafficDays)
  const medFirstAi = median(firstAiDays)
  const fastestAi = firstAiDays.length ? Math.min(...firstAiDays) : null
  const slowestAi = firstAiDays.length ? Math.max(...firstAiDays) : null
  const sectionCOk = timingOk

  // ── FB-033 · Build context for the Executive Synopsis card ─────────────────
  // Every value here mirrors the exact expression the §A KPI cards render
  // (content-impact.tsx §A KPI strip below), so the synopsis and the KPI
  // strip can never disagree on a numeric claim.
  //
  // topBrandAbsentCompetitorUrls + brandAbsentCompetitorUrlCount mirror the
  // §H.2 live derivation: a "brand-absent" URL is a cited URL that does NOT
  // mention your brand and DOES mention at least one competitor brand. We
  // reuse the same filter §H.2 uses (urlCitations.filter(c => !c.mentionsYourBrand
  // && c.competitorBrandNames.length > 0)) so the count + items can never
  // disagree with the §H.2 table further down the page.

  // Top 3 owned domains by AI citation count.
  const topOwnedForSynopsis = filteredOwnDomains
    .slice()
    .sort((a, b) => (b.citationRate ?? 0) - (a.citationRate ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationRate ?? 0 }))

  // Top 3 competitor domains by AI citation count.
  const topCompetitorForSynopsis = filteredCompetitorDomains
    .slice()
    .sort((a, b) => (b.citationRate ?? 0) - (a.citationRate ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationRate ?? 0 }))

  // Brand-absent URLs, mirror §H.2 live filter exactly.
  const brandAbsentUrlsForSynopsis = urlCitations.filter(
    c => !c.mentionsYourBrand && c.competitorBrandNames.length > 0,
  )
  const topBrandAbsentForSynopsis = brandAbsentUrlsForSynopsis
    .slice()
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 3)
    .map(c => ({ url: c.url, host: c.domain, citationCount: c.citationCount }))

  // §A "Owned URLs with AI Activity", mirror the exact expression at the KPI card.
  const ownedUrlsWithAiActivity = agentData
    ? (models != null
        ? filteredBots.reduce((s, b) => s + b.uniquePages, 0)
        : agentData.uniquePagesVisited)
    : null

  const synopsisContext: ContentImpactSynopsisContext = {
    plannedUrlsInScope: calendarData?.plannedCount ?? null,
    liveUrls: calendarData?.liveCount ?? null,
    totalSessions: ga4TotalSessions,
    totalAiCitations: totalCitations,
    aiReferredSessions: ga4AiReferredSessions,
    ownedUrlsWithAiActivity,
    unmatchedPct,
    ownedDomainsCited: filteredOwnDomains.length,
    topOwnedDomainsByCitations: topOwnedForSynopsis,
    topCompetitorDomainsByCitations: topCompetitorForSynopsis,
    topBrandAbsentCompetitorUrls: topBrandAbsentForSynopsis,
    brandAbsentCompetitorUrlCount: brandAbsentUrlsForSynopsis.length,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      <SectionHeader
        icon={FileText}
        title="How is content performing across AI and human channels?"
        subtitle="Which content assets earn LLM citations, where content investments translate into AI visibility, and what the content team should build next."
      />

      {calendarIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── FB-033 · Executive Synopsis (AI-generated, Glean-backed) ────────── */}
      <Suspense
        fallback={
          <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
            <div className="mb-4 h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-white/10" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-10/12 animate-pulse rounded bg-white/10" />
            </div>
          </section>
        }
      >
        <ContentImpactSynopsis
          clientSlug={clientSlug}
          dateRange={dateRange}
          context={synopsisContext}
        />
      </Suspense>

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">How is content performing at a glance?</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Planned URLs in Scope"
            hint="Content calendar rows"
            value={calendarData ? calendarData.plannedCount.toLocaleString() : 'None'}
            live={!!calendarData && calendarData.plannedCount > 0}
          />
          <KpiCard
            label="Live URLs"
            hint="Matched or discoverable"
            value={calendarData ? calendarData.liveCount.toLocaleString() : 'None'}
            live={!!calendarData && calendarData.liveCount > 0}
          />
          {/* Total Sessions: GA4 has no model dimension — not filtered.
              When a model filter is active, append a disclaimer to the hint. */}
          <KpiCard
            label="Total Sessions"
            hint={calendarIsDemo ? 'Sample · last 30d' : 'GA4 sessions, all sources'}
            value={
              calendarIsDemo ? '9,910'
                : ga4TotalSessions !== null ? ga4TotalSessions.toLocaleString()
                : 'None'
            }
            live={calendarIsDemo || ga4TotalSessions !== null}
          />
          {/* AI Citations: filtered by selected models via domainCitationsByModel sum */}
          <KpiCard
            label="AI Citations"
            hint={`Peec AI, owned domains YTD${models ? ' · filtered to selected AI models' : ''}`}
            value={peecData ? totalCitations.toLocaleString() : 'None'}
            live={totalCitations > 0}
          />
          {/* AI-Referred Sessions: GA4 has no model dimension — not filtered.
              When a model filter is active, append a disclaimer to the hint. */}
          <KpiCard
            label="AI-Referred Sessions"
            hint={
              calendarIsDemo
                ? `Sample · last 30d${models ? ' · across all AI engines' : ''}`
                : `GA4 AI-source sessions${models ? ' · across all AI engines' : ''}`
            }
            value={
              calendarIsDemo ? '1,243'
                : ga4AiReferredSessions !== null ? ga4AiReferredSessions.toLocaleString()
                : 'None'
            }
            live={calendarIsDemo || ga4AiReferredSessions !== null}
          />
          {/* Owned URLs with AI Activity: when model filter active, sum uniquePages
              across filteredBots. When no filter, fall back to the pre-aggregated
              uniquePagesVisited from the agent-analytics response. */}
          <KpiCard
            label="Owned URLs with AI Activity"
            hint={`Bot-crawled pages (30d)${models ? ' · filtered to selected AI models' : ''}`}
            value={agentData
              ? `${models != null
                  ? filteredBots.reduce((s, b) => s + b.uniquePages, 0)
                  : agentData.uniquePagesVisited
                } pages`
              : 'None'}
            live={!!agentData && agentData.uniquePagesVisited > 0}
          />
          <KpiCard
            label="% Null / Unmatched"
            hint="Planned content with no data"
            value={unmatchedPct !== null ? `${unmatchedPct}%` : 'None'}
            live={unmatchedPct !== null}
          />
          {/* Owned Domains Cited in AI: filtered by selected models via per-model citation data */}
          <KpiCard
            label="Owned Domains Cited in AI"
            hint={`Peec AI brand-owned domains with citations${models ? ' · filtered to selected AI models' : ''}`}
            value={peecData ? filteredOwnDomains.length.toLocaleString() : 'None'}
            live={filteredOwnDomains.length > 0}
          />
        </div>
      </div>

      {/* ── Section B: Planned Content Performance Table (PRD: 16 columns) ── */}
      {(() => {
        const sectionBDemoPub = ['2026-05-12', '2026-04-28', '2026-04-09', '2026-03-22', '2026-03-04', '2026-02-15', '2026-01-30', '2026-01-14', '2025-12-22', '2025-12-05', '2025-11-19', '2025-10-30', '2025-10-12']
        const sectionBDemoUpd = ['2026-05-28', '2026-05-04', '2026-04-22', '2026-04-08', '2026-03-18', '2026-03-01', '2026-02-12', '2026-01-25', '2026-01-08', '2025-12-18', '2025-12-01', '2025-11-09', '2025-10-24']
        const sectionBDemoCite = [12, 8, 5, 14, 3, 18, 7, 0, 9, 22, 4, 11, 6]
        const sectionBDemoBot  = [47, 23, 18, 89, 12, 156, 31, 8, 64, 212, 27, 73, 41]
        const sectionBDemoRef  = [238, 152, 87, 412, 64, 524, 109, 31, 196, 671, 78, 245, 134]
        const sectionBRows: PlannedContentRow[] = enrichedRows.map((row, i) => {
          const g = getGA4Metrics(row.url, ga4Rows)
          const hasBotVisits = (row.aiBotVisits ?? 0) > 0
          return {
            topic: row.topic,
            url: row.url,
            contentType: row.contentType,
            status: row.status,
            contentAction: row.contentAction,
            publishDate: row.publishDate ?? (calendarIsDemo ? sectionBDemoPub[i % 13] : null),
            updateDate: row.updateDate ?? (calendarIsDemo ? sectionBDemoUpd[i % 13] : null),
            sessions: g.sessions,
            users: g.users,
            views: g.views,
            engagementRate: g.engagementRate,
            aiCitations: calendarIsDemo ? sectionBDemoCite[i % 13]
                                        : citationsOk ? (citeByKey.get(urlJoinKey(row.url) ?? '')?.citationCount ?? 0) : null,
            aiBotActivity: hasBotVisits ? (row.aiBotVisits ?? null) : (calendarIsDemo ? sectionBDemoBot[i % 13] : 0),
            aiReferredSessions: calendarIsDemo ? sectionBDemoRef[i % 13] : aiReferredForPath(extractPath(row.url)),
            matchStatus: row.matchStatus,
            recommendedAction: deriveAction(row, hasBotVisits),
            _key: `${row.url ?? row.topic}-${i}`,
          }
        })
        return (
          <PlannedContentPerformanceTable
            rows={sectionBRows}
            ga4Connected={!!ga4Rows}
            emptyMessage={calendarData
              ? 'Content calendar loaded but no rows found -- check sheet format and column headers'
              : 'Connect content calendar (Google Sheet) + GA4 page-level data to populate'}
          />
        )
      })()}

      {/* ── Section C: Time to First Traffic / AI Activity ─────────────────── */}
      <SectionCard
        title="How quickly does new content earn traffic and AI citations?"
        description="For each published URL, measures days from publish date to first GA4 session and first AI citation or bot crawl."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Clock, label: 'Median Days to First Traffic',     color: '#39A0FF', demo: '14 days', val: medFirstTraffic },
            { icon: Clock, label: 'Median Days to First AI Activity', color: '#60FDFF', demo: '22 days', val: medFirstAi },
            { icon: TrendingUp,   label: 'Fastest AI-Indexed Content',  color: '#60FF80', demo: '4 days', val: fastestAi },
            { icon: TrendingDown, label: 'Slowest AI-Indexed Content',  color: '#FF4444', demo: '47 days', val: slowestAi },
          ].map(({ icon: Icon, label, color, demo, val }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold text-text-muted">{label}</span>
              <span className={cn('text-lg font-bold', (calendarIsDemo || val !== null) ? 'text-white' : 'text-white/20')}>
                {calendarIsDemo ? demo : val !== null ? `${Math.round(val)} days` : 'None'}
              </span>
            </div>
          ))}
        </div>
        {!calendarIsDemo && !sectionCOk && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">
              {calendarData
                ? 'Connect GA4 to calculate days-to-first-traffic per planned URL'
                : 'Requires content calendar publish dates + GA4 page-level first-session data'}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Section F: Owned Content Cited in AI (PRD: 9 columns) ─────────── */}
      {(() => {
        const demoTopics    = ['AEO Strategy', 'AI Marketing Trends', 'Brand Visibility', 'Content Performance', 'Citation Patterns']
        const demoClusters  = ['Discovery', 'Comparison', 'How-to', 'Research', 'Brand Authority']
        const demoEngines   = ['ChatGPT, Claude', 'ChatGPT, Perplexity', 'Claude, Gemini', 'ChatGPT, Copilot', 'Perplexity, Claude']
        const demoPositions = [1.8, 2.3, 1.5, 2.7, 2.1]
        const demoAiSessions = [284, 197, 412, 156, 203]
        // Engines citing each owned domain. Key on a normalized host so the
        // raw Peec /reports/domains value (d.domain) joins to the host derived
        // from /reports/urls. Do NOT filter on mentionsYourBrand: an engine can
        // cite an owned-domain page in an answer that never names the brand —
        // the owned-domain lookup below already scopes this to our pages.
        const domainKey = (s: string) => s.toLowerCase().replace(/^www\./, '')
        const enginesByDomain = new Map<string, Set<string>>()
        for (const c of urlCitations) {
          const k = domainKey(c.domain)
          if (!enginesByDomain.has(k)) enginesByDomain.set(k, new Set())
          for (const e of c.engines) enginesByDomain.get(k)!.add(e)
        }
        // filteredOwnDomains: model-filtered when models filter is active (uses
        // per-model citation data from domainCitationsByModel). Unfiltered when
        // no model filter or domainCitationsByModel is unavailable.
        const ownedRows: OwnedContentCitedRow[] = filteredOwnDomains.map((d, i) => ({
          urlOrDomain: d.domain,
          topic: calendarIsDemo ? demoTopics[i % demoTopics.length] : null,
          // Prompt Cluster = themes (tags) this owned domain is cited under, joined.
          // "None" when coverage loaded but the domain has no theme; -- only when
          // coverage is unavailable.
          promptCluster: calendarIsDemo
            ? demoClusters[i % demoClusters.length]
            : coverageAvailable ? (domainTagNames(coverage, d.domain).join(', ') || 'None') : null,
          aiCitationCount: d.citationRate,
          aiEnginesCiting: calendarIsDemo ? demoEngines[i % demoEngines.length]
            : (enginesByDomain.get(domainKey(d.domain))?.size ? Array.from(enginesByDomain.get(domainKey(d.domain))!).map((e) => MODEL_DISPLAY_LABELS[e as AEOModel] ?? e).join(', ') : null),
          avgCitations: calendarIsDemo ? demoPositions[i % demoPositions.length] : (avgCitByDomain[hostKey(d.domain)] ?? null),
          // AI-referred sessions for this owned domain, joined by host. A host
          // GA4 tracks shows its real count (0 if none); a host GA4 doesn't
          // cover stays -- (null) rather than a misleading 0.
          aiReferredSessions: calendarIsDemo
            ? demoAiSessions[i % demoAiSessions.length]
            : ga4Hosts.has(hostKey(d.domain)) ? (aiRefByHost.get(hostKey(d.domain)) ?? 0) : null,
          postLaunchAILift: d.retrievedDelta,
          recommendedAction: 'Monitor and protect citation position',
        }))
        return (
          <OwnedContentCitedTable
            rows={ownedRows}
            emptyMessage="No owned-domain citation data available from Peec AI"
          />
        )
      })()}

      {/* ── Section H: Competitor / Third-Party Content (PRD: 2 sub-views) ── */}
      <SectionCard
        title="Which competitor or third-party pages are cited for our prompts?"
        description="Non-owned content that AI tools cite for your tracked prompts. Understanding what wins informs what to create or pitch."
      >
        {/* Sub-view 1: Top Competitor Domains */}
        {(() => {
          // filteredCompetitorDomains: model-filtered when models filter is active.
          // v1 limitation: promptCoverage and themeCoverage are not re-computed
          // per selected model — they reflect all-model aggregates from Peec data.
          const h1Rows: CompetitorDomainsCitedRow[] = filteredCompetitorDomains.slice(0, 10).map((d, i) => {
            const promptCovReal = getPromptCoverage(d.domain)
            const themeCovReal  = getThemeCoverage(d.domain)
            const demoPromptCov = [42, 31, 56, 28, 67, 19, 38, 49, 23, 35][i % 10]
            const demoThemeCov  = [3, 2, 4, 1, 5, 1, 3, 4, 2, 2][i % 10]
            // Real coverage (incl. a known 0) is shown as-is; demo fills only
            // when there's no real coverage (helpers return null).
            const promptCov = promptCovReal !== null ? promptCovReal : (calendarIsDemo ? demoPromptCov : null)
            const themeCov  = themeCovReal  !== null ? themeCovReal  : (calendarIsDemo ? demoThemeCov : null)
            return {
              domain: d.domain,
              citationCount: d.citationRate,
              promptCoverage: promptCov,
              themeCoverage: themeCov,
            }
          })
          return (
            <CompetitorDomainsCitedTable
              rows={h1Rows}
              emptyMessage="No competitor domain data available from Peec AI"
            />
          )
        })()}

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: Brand-Absent Editorial URLs */}
        {(() => {
          const demoArticleTitles2 = [
            'How AI is rewriting brand discovery',
            'The 2026 PR-to-LLM playbook',
            'Why brand authority matters more than backlinks',
            'Inside the AEO arms race',
            'Earned media in the age of generative AI',
            'How Fortune 500s rank inside ChatGPT',
            'The new rules of editorial citation',
            'Building defensible brand share-of-voice',
            'AI-first brand strategy for 2026',
            'Decoding citation patterns across LLMs',
          ]
          const demoSlugs2 = [
            '/insights/ai-brand-discovery',
            '/guides/pr-llm-playbook-2026',
            '/analysis/brand-authority-vs-links',
            '/features/aeo-arms-race',
            '/columns/earned-media-genai',
            '/data/fortune-500-chatgpt-rankings',
            '/op-ed/new-editorial-citation-rules',
            '/research/defensible-share-of-voice',
            '/strategy/ai-first-brand-2026',
            '/data/citation-patterns-llms',
          ]
          const demoClusters2 = [
            'Brand authority',
            'Buying-stage research',
            'Reputation / trust',
            'Brand authority',
            'Industry expertise',
            'Competitive comparison',
            'Reputation / trust',
            'Buying-stage research',
            'Brand authority',
            'Industry expertise',
          ]
          const demoCompetitorsAbsent = [
            ['Ogilvy', 'Edelman'],
            ['Weber Shandwick'],
            ['BCW', 'FleishmanHillard'],
            ['Edelman', 'Ogilvy', 'Weber Shandwick'],
            ['MSL'],
            ['Edelman'],
            ['Ogilvy', 'BCW'],
            ['Weber Shandwick', 'MSL'],
            ['Edelman', 'Ogilvy'],
            ['FleishmanHillard'],
          ]
          const demoBrandMentioned = ['No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No', 'No']
          const demoH2Rows: CompetitorUrlsBrandAbsentRow[] = filteredEditorialDomains.slice(0, 10).map((d, i) => {
            const title   = demoArticleTitles2[i % demoArticleTitles2.length]
            const slug    = demoSlugs2[i % demoSlugs2.length]
            const url     = `https://${d.domain}${slug}`
            const cluster = demoClusters2[i % demoClusters2.length]
            const comps   = demoCompetitorsAbsent[i % demoCompetitorsAbsent.length]
            const brand   = demoBrandMentioned[i % demoBrandMentioned.length]
            return {
              domain: d.domain,
              articleTitle: title,
              url,
              promptCluster: cluster,
              citationCount: d.citationRate,
              competitorsMentioned: comps.join(', '),
              brandMentioned: brand,
              opportunityPriority: 'Review',
              suggestedPRAngle: `Secure coverage on ${d.domain} to displace competitor citations`,
            }
          })

          const competitorCitedUrls = urlCitations
            .filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, 10)

          const h2Rows: CompetitorUrlsBrandAbsentRow[] = calendarIsDemo
            ? demoH2Rows
            : competitorCitedUrls.map((c) => ({
                domain: c.domain,
                articleTitle: c.title,
                url: c.url,
                // Themes (tags) this competitor domain is cited under, joined.
                // "None" when coverage loaded but no theme; -- only when unavailable.
                promptCluster: coverageAvailable ? (domainTagNames(coverage, c.domain).join(', ') || 'None') : null,
                citationCount: c.citationCount,
                competitorsMentioned: c.competitorBrandNames.join(', ') || null,
                brandMentioned: 'No',
                opportunityPriority: 'Review',
                suggestedPRAngle: `Secure coverage on ${c.domain} to displace competitor citations`,
              }))

          return (
            <div className="flex flex-col gap-3">
              <CompetitorUrlsBrandAbsentTable
                rows={h2Rows}
                emptyMessage="No editorial domain data from Peec AI"
              />
            </div>
          )
        })()}

      </SectionCard>

    </div>
  )
}
