import { FileText, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPeecOverview } from '@/lib/peec/client'
import type { TopDomain } from '@/lib/peec/client'
import { getAgentAnalytics } from '@/lib/peec/agent-analytics'
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'
import { getUrlCitations, getDomainCoverage, domainPromptIds, domainTagIds, domainTagNames, avgCitationsByDomain } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'
import type { AEOModel } from '@/lib/peec/models'
import { sumByModel, filterDomainRowsByModel } from '@/lib/peec/by-model'
import { getContentCalendarData } from '@/lib/content-calendar/client'
import type { ContentCalendarData, ContentCalendarRow } from '@/lib/content-calendar/types'
import { sampleContentCalendarData } from '@/lib/demo-data/content-calendar'
import { sampleAgentAnalytics } from '@/lib/demo-data/agent-analytics'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SAMPLE_GA4_CONTENT_IMPACT_ROWS } from '@/lib/demo-data/ga4-content-impact'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query } from '@/lib/ga4/client'
import {
  PlannedContentPerformanceTable,
  OwnedContentCitedTable,
  TrafficNoCitationsTable,
  CitationsLittleTrafficTable,
  BotAttentionNoCitationsTable,
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  RepeatedCompetitorPagesTable,
  AISystemsInteractingTable,
  ContentTeamRecommendationsTable,
  type PlannedContentRow,
  type OwnedContentCitedRow,
  type TrafficNoCitationsRow,
  type CitationsLittleTrafficRow,
  type BotAttentionNoCitationsRow,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
  type RepeatedCompetitorPagesRow,
  type AISystemsInteractingRow,
  type ContentTeamRecommendationsRow,
} from './content-impact-tables'
/**
 * Peec only returns 'YTD' and 'Last 30 days' aggregates from getPeecOverview.
 * Map the page-level dateRange to one of those two keys for the relevant tiles.
 */
function peecRangeKey(dateRange?: string): 'YTD' | 'Last 30 days' {
  if (!dateRange) return 'Last 30 days'
  if (['last_7_days', 'last_14_days', 'last_30_days', 'this_month'].includes(dateRange)) return 'Last 30 days'
  return 'YTD'
}

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
  return 'Connect GA4 for full session analysis'
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
  const [peecResult, agentResult, calendarResult, ga4Result, urlCitationsResult, coverageResult] = await Promise.allSettled([
    getPeecOverview(clientSlug),        // multi-client: uses peecCustomerProjectId from config
    getAgentAnalytics(clientSlug),
    getContentCalendarData(clientSlug), // null when contentCalendarSheetId not configured
    ga4Query({                          // page-level sessions for Section B -- requires ga4PropertyId
      clientSlug,
      dateRange: dateRange ?? 'last_30_days',
      metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
      dimensions: ['pagePath'],
      limit: 1000,
    }),
    getUrlCitations(clientSlug),
    getDomainCoverage(clientSlug),      // per-domain prompt/theme coverage (Section H)
  ])

  let peecData     = peecResult.status     === 'fulfilled' ? peecResult.value     : null
  let agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null
  let calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : null
  let ga4Rows      = ga4Result.status      === 'fulfilled' ? ga4Result.value.rows : null
  let urlCitations = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
  let coverage     = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {}, tagNameById: {} }

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
    coverage     = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagNameById: {} }  // demo: §H uses demo fallbacks
  }

  if (peecResult.status         === 'rejected') console.error('[content-impact] Peec error:', peecResult.reason)
  if (agentResult.status        === 'rejected') console.error('[content-impact] Agent analytics error:', agentResult.reason)
  if (calendarResult.status     === 'rejected') console.error('[content-impact] Content calendar error:', calendarResult.reason)
  if (ga4Result.status          === 'rejected') console.error('[content-impact] GA4 error:', ga4Result.reason)
  if (urlCitationsResult.status === 'rejected') console.error('[content-impact] URL citations error:', urlCitationsResult.reason)

  // ── Derived metrics ────────────────────────────────────────────────────────
  const rangeKey          = peecRangeKey(dateRange)
  const ownDomains        = (peecData?.domainsByRange[rangeKey] ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.domainsByRange[rangeKey] ?? []).filter(d => d.type === 'Competitor')
  const editorialDomains  = (peecData?.domainsByRange[rangeKey] ?? []).filter(d => d.type === 'Editorial')

  // ── AI Citations KPI: filtered by selected models when active ───────────────
  // When a model filter is active, sum domainCitationsByModel across selected
  // models for all domains. When no filter, use the pre-aggregated YTD total.
  const totalCitations = models != null && peecData?.domainCitationsByModel
    ? Object.keys(peecData.domainCitationsByModel).reduce(
        (acc, domain) => acc + sumByModel(peecData!.domainCitationsByModel, domain, models),
        0,
      )
    : (peecData?.totalCitationsByRange['YTD'] ?? 0)

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

  // Recompute aggregates from filteredBots so KPI cards stay consistent.
  const bots = filteredBots
  const totalBotVisits = models != null
    ? filteredBots.reduce((s, b) => s + b.totalVisits, 0)
    : (agentData?.totalBotVisits ?? 0)

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

  // Section D aggregates (new vs optimized)
  const newRows       = enrichedRows.filter(r => r.contentAction === 'new')
  const optimizedRows = enrichedRows.filter(r => r.contentAction === 'optimized')

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
          <FileText className="h-5 w-5 text-[#60FF80]" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">How is content performing across AI and human channels?</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Which content assets earn LLM citations, where content investments translate into AI visibility, and what the content team should build next.
          </p>
        </div>
      </div>

      {calendarIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">How is content performing at a glance?</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Planned URLs in Scope"
            hint="Content calendar rows"
            value={calendarData ? calendarData.plannedCount.toLocaleString() : '--'}
            live={!!calendarData && calendarData.plannedCount > 0}
          />
          <KpiCard
            label="Live URLs"
            hint="Matched or discoverable"
            value={calendarData ? calendarData.liveCount.toLocaleString() : '--'}
            live={!!calendarData && calendarData.liveCount > 0}
          />
          {/* Total Sessions: GA4 has no model dimension — not filtered.
              When a model filter is active, append a disclaimer to the hint. */}
          <KpiCard
            label="Total Sessions"
            hint={
              calendarIsDemo
                ? `Sample · last 30d${models ? ' · across all AI engines' : ''}`
                : 'GA4 page-level required'
            }
            value={calendarIsDemo ? '9,910' : '--'}
            live={calendarIsDemo}
          />
          {/* AI Citations: filtered by selected models via domainCitationsByModel sum */}
          <KpiCard
            label="AI Citations"
            hint={`Peec AI, owned domains YTD${models ? ' · filtered to selected AI models' : ''}`}
            value={peecData ? totalCitations.toLocaleString() : '--'}
            live={totalCitations > 0}
          />
          {/* AI-Referred Sessions: GA4 has no model dimension — not filtered.
              When a model filter is active, append a disclaimer to the hint. */}
          <KpiCard
            label="AI-Referred Sessions"
            hint={
              calendarIsDemo
                ? `Sample · last 30d${models ? ' · across all AI engines' : ''}`
                : `GA4 AI-source sessions required${models ? ' · across all AI engines' : ''}`
            }
            value={calendarIsDemo ? '1,243' : '--'}
            live={calendarIsDemo}
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
              : '--'}
            live={!!agentData && agentData.uniquePagesVisited > 0}
          />
          <KpiCard
            label="% Null / Unmatched"
            hint="Planned content with no data"
            value={unmatchedPct !== null ? `${unmatchedPct}%` : '--'}
            live={unmatchedPct !== null}
          />
          {/* Owned Domains Cited in AI: filtered by selected models via per-model citation data */}
          <KpiCard
            label="Owned Domains Cited in AI"
            hint={`Peec AI brand-owned domains with citations${models ? ' · filtered to selected AI models' : ''}`}
            value={peecData ? filteredOwnDomains.length.toLocaleString() : '--'}
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
                                        : (citeByKey.get(urlJoinKey(row.url) ?? '')?.citationCount ?? null),
            aiBotActivity: hasBotVisits ? (row.aiBotVisits ?? null) : (calendarIsDemo ? sectionBDemoBot[i % 13] : 0),
            aiReferredSessions: calendarIsDemo ? sectionBDemoRef[i % 13] : null,
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
            { icon: Clock, label: 'Median Days to First Traffic',     color: '#39A0FF', demo: '14 days' },
            { icon: Clock, label: 'Median Days to First AI Activity', color: '#60FDFF', demo: '22 days' },
            { icon: TrendingUp,   label: 'Fastest AI-Indexed Content',  color: '#60FF80', demo: '4 days' },
            { icon: TrendingDown, label: 'Slowest AI-Indexed Content',  color: '#FF4444', demo: '47 days' },
          ].map(({ icon: Icon, label, color, demo }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold text-text-muted">{label}</span>
              <span className={cn('text-lg font-bold', calendarIsDemo ? 'text-white' : 'text-white/20')}>
                {calendarIsDemo ? demo : '--'}
              </span>
            </div>
          ))}
        </div>
        {!calendarIsDemo && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">
              {calendarData
                ? 'Connect GA4 to calculate days-to-first-traffic per planned URL'
                : 'Requires content calendar publish dates + GA4 page-level first-session data'}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Section D: Net-New vs Optimized Content Lift ───────────────────── */}
      <SectionCard
        title="Which delivers more lift — new content or optimization?"
        description="Compares performance between net-new content launches and optimized (refreshed/expanded) pages."
      >
        {calendarData && (newRows.length > 0 || optimizedRows.length > 0) ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: 'Net-New Content',   rows: newRows,       color: '#60FF80',
                demoAvgSessions: '1,012', demoCitationRate: '26%', demoAiRefSessions: '847', demoTimeToAI: '18 days' },
              { label: 'Optimized Content', rows: optimizedRows, color: '#39A0FF',
                demoAvgSessions: '715',   demoCitationRate: '18%', demoAiRefSessions: '315', demoTimeToAI: '9 days' },
            ].map(({ label, rows: group, color, demoAvgSessions, demoCitationRate, demoAiRefSessions, demoTimeToAI }) => (
              <div key={label} className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <p className="text-xs font-bold text-white/70">{label}</p>
                  <span className="ml-auto text-xs tabular-nums text-white/40">{group.length} URLs</span>
                </div>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      metric: 'Live URLs',
                      value: group.filter(r => r.matchStatus === 'matched' || r.matchStatus === 'unknown').length.toString(),
                      live: true,
                    },
                    {
                      metric: 'Bot-Crawled Pages',
                      value: group.filter(r => (r.aiBotVisits ?? 0) > 0).length.toString(),
                      live: true,
                    },
                    { metric: 'Avg Sessions (30d)',          value: calendarIsDemo ? demoAvgSessions : '--',  live: calendarIsDemo },
                    { metric: 'AI Citation Rate',            value: calendarIsDemo ? demoCitationRate : '--', live: calendarIsDemo },
                    { metric: 'AI-Referred Sessions',        value: calendarIsDemo ? demoAiRefSessions : '--', live: calendarIsDemo },
                    { metric: 'Time to First AI Activity',   value: calendarIsDemo ? demoTimeToAI : '--',     live: calendarIsDemo },
                  ].map(({ metric, value, live }) => (
                    <div key={metric} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{metric}</span>
                      <span className={cn('tabular-nums', live ? 'text-white' : 'text-white/20')}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {['Net-New Content', 'Optimized Content'].map((type) => (
              <div key={type} className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-xs font-bold text-white/60">{type}</p>
                <div className="flex flex-col gap-2">
                  {['Avg Sessions (30d)', 'AI Citation Rate', 'AI-Referred Sessions', 'Time to First AI Activity'].map(m => (
                    <div key={m} className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">{m}</span>
                      <span className="tabular-nums text-white/20">--</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!calendarData && (
          <p className="text-[10px] text-text-muted">Requires content calendar with Content Action column (new / optimized / other).</p>
        )}
      </SectionCard>

      {/* ── Section E: Decay vs Compounding Content ────────────────────────── */}
      <SectionCard
        title="Which content is decaying vs. compounding over time?"
        description="Classifies owned content by trajectory. Compounding content with AI citation activity represents the highest-value assets to protect and scale."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Compounding URLs',       color: '#60FF80', desc: 'Traffic accelerating + AI cited',     demoCount: 5 },
            { label: 'Stable URLs',            color: '#FFFC60', desc: 'Flat traffic, some AI activity',      demoCount: 4 },
            { label: 'Decaying URLs',          color: '#FF4444', desc: 'Declining traffic, low AI citation',  demoCount: 2 },
            { label: 'High AI / Low Traffic',  color: '#60FDFF', desc: 'AI-cited but no human traffic yet',   demoCount: 2 },
            { label: 'High Traffic / No AI',   color: '#39A0FF', desc: 'Popular but not AI-indexed',          demoCount: 1 },
            { label: 'No Activity',            color: '#8A8A8A', desc: 'Neither traffic nor AI citations',    demoCount: 1 },
          ].map(({ label, color, desc, demoCount }) => (
            <div key={label} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-white/60">{label}</span>
              </div>
              <span className={cn('text-lg font-bold', calendarIsDemo ? 'text-white' : 'text-white/20')}>
                {calendarIsDemo ? demoCount : '--'}
              </span>
              <span className="text-[10px] text-text-muted">{desc}</span>
            </div>
          ))}
        </div>
        {!calendarIsDemo && (
          <p className="text-[10px] text-text-muted">Requires GA4 page-level session trends (MoM) + Peec AI citation data to classify content trajectory.</p>
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
            : (enginesByDomain.get(domainKey(d.domain))?.size ? Array.from(enginesByDomain.get(domainKey(d.domain))!).join(', ') : null),
          avgCitations: calendarIsDemo ? demoPositions[i % demoPositions.length] : (avgCitByDomain[hostKey(d.domain)] ?? null),
          aiReferredSessions: calendarIsDemo ? demoAiSessions[i % demoAiSessions.length] : null,
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

      {/* ── Section G: Content Gaps (PRD: 3 sub-views) ────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <div>
          <h3 className="text-sm font-bold text-white">Where is content disconnected from AI demand?</h3>
          <p className="mt-1 text-xs text-text-muted">
            Three views of content gap: pages with traffic but no AI citations, AI-cited pages without human traffic, and bot-crawled pages without citations or visits.
          </p>
        </div>

        {/* Sub-view 1: Traffic but No AI Citations */}
        {(() => {
          const g1Rows: TrafficNoCitationsRow[] = calendarIsDemo
            ? [
                { url: '/services',                          topic: 'Services Overview',       sessions: 827,  aiCitations: 0, opportunityNote: 'Add structured data + brand authority signals to surface in agency-comparison queries' },
                { url: '/about',                             topic: 'About Avenue Z',          sessions: 1042, aiCitations: 0, opportunityNote: 'Add founder story + clear capability statement for "who is Avenue Z" type prompts' },
                { url: '/blog/audit-brand-chatgpt',          topic: 'How to Audit Brand',      sessions: 447,  aiCitations: 0, opportunityNote: 'Already strong page — needs interlinking from AEO pillar to compound citation signal' },
                { url: '/pricing',                           topic: 'Pricing',                 sessions: 274,  aiCitations: 0, opportunityNote: 'Add ROI calculator + comparison framing for "agency pricing" prompts' },
              ]
            : []
          return (
            <TrafficNoCitationsTable
              rows={g1Rows}
              emptyMessage="Requires GA4 page sessions + Peec AI owned-domain URL-level data"
            />
          )
        })()}

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: AI Citations but Little Human Traffic */}
        {(() => {
          const g2Rows: CitationsLittleTrafficRow[] = calendarIsDemo
            ? [
                { url: '/methodology/brand-authority',        topic: 'Brand Authority',         aiCitations: 18, sessions: 524, opportunityNote: 'Highly cited but low human traffic — add prominent CTA to drive trial sign-ups' },
                { url: '/press/techcrunch-feature',           topic: 'Press: TechCrunch',       aiCitations:  9, sessions: 213, opportunityNote: 'Press coverage drives AI citation but doesn\'t convert — add follow-up content path' },
                { url: '/case-studies/renaissance-benefits',  topic: 'Renaissance Case Study',  aiCitations: 14, sessions: 392, opportunityNote: 'Industry credibility piece — link from services page to convert authority into demos' },
                { url: '/resources/geo-glossary',             topic: 'GEO Glossary',            aiCitations: 36, sessions: 983, opportunityNote: 'Strong organic citation — embed in-context CTAs without disrupting reference utility' },
              ]
            : []
          return (
            <CitationsLittleTrafficTable
              rows={g2Rows}
              emptyMessage="Requires GA4 + Peec AI URL-level citation data"
            />
          )
        })()}

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: AI Bot Attention but No Citations/Visits (LIVE from agent-analytics)
            v1 limitation: this table is built from agentData.topPaths, which is path-level
            and not segmented by bot identity. We cannot honor the model filter here without
            backend changes to expose per-bot path breakdowns. When a model filter is active,
            this table shows the all-bots view as-is. Future enhancement: add a
            topPathsByBot field to AgentAnalyticsData. */}
        {(() => {
          const g3DemoTopics = ['Services Overview', 'About Avenue Z', 'Brand Authority', 'GEO Glossary', 'How to Audit Brand', 'Renaissance Case Study', 'Press: TechCrunch', 'Pricing', 'AEO Services', '2026 AI Trends']
          const g3DemoCites = [3, 1, 8, 12, 5, 2, 4, 0, 6, 9]
          const g3DemoSessions = [42, 18, 87, 156, 64, 31, 53, 12, 78, 109]
          const g3Rows: BotAttentionNoCitationsRow[] = (agentData?.topPaths ?? []).slice(0, 10).map((p, idx) => {
            const calMatch = enrichedRows.find(r => {
              const rPath = extractPath(r.url)
              return rPath && (rPath === p.path || rPath === p.path.replace(/\/$/, ''))
            })
            return {
              urlPath: p.path,
              topic: calMatch?.topic ?? (calendarIsDemo ? g3DemoTopics[idx % 10] : '--'),
              aiBotVisits: p.visits,
              aiCitations: calendarIsDemo ? g3DemoCites[idx % 10] : null,
              aiReferredSessions: calendarIsDemo ? g3DemoSessions[idx % 10] : null,
              opportunityNote: p.status >= 400 ? 'Error page -- fix or redirect'
                : p.status >= 300 ? 'Redirect -- verify final destination'
                : 'Crawled but not cited -- check content format for LLM extraction',
            }
          })
          return (
            <BotAttentionNoCitationsTable
              rows={g3Rows}
              emptyMessage="No AI bot crawl data available -- check PEEC_AI_CUSTOMER_TOKEN configuration."
            />
          )
        })()}
      </div>

      {/* ── Section H: Competitor / Third-Party Content (PRD: 3 sub-views) ── */}
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

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: Repeated Competitor Pages Across Themes */}
        {(() => {
          const h3Rows: RepeatedCompetitorPagesRow[] = calendarIsDemo
            ? [
                { url: 'ogilvy.com/insights/brand-authority-in-llms',     competitor: 'Ogilvy',           clusters: ['Brand authority', 'Reputation / trust', 'Industry expertise'], citations: 24, avgPos: 2.1 },
                { url: 'edelman.com/research/trust-barometer-2026',       competitor: 'Edelman',          clusters: ['Reputation / trust', 'Buying-stage research'],                 citations: 19, avgPos: 2.4 },
                { url: 'webershandwick.com/work/ai-pr-case-studies',      competitor: 'Weber Shandwick',  clusters: ['Industry expertise', 'Competitive comparison'],                citations: 17, avgPos: 3.0 },
                { url: 'bcw-global.com/expertise/aeo-services',           competitor: 'BCW',              clusters: ['Brand authority', 'Buying-stage research'],                    citations: 14, avgPos: 3.3 },
                { url: 'fleishmanhillard.com/2026/ai-search-report',      competitor: 'FleishmanHillard', clusters: ['Industry expertise', 'Reputation / trust', 'Brand authority'], citations: 13, avgPos: 2.7 },
                { url: 'mslgroup.com/insights/generative-pr',             competitor: 'MSL',              clusters: ['Industry expertise', 'Competitive comparison'],                citations: 11, avgPos: 3.5 },
              ]
            : []
          return (
            <RepeatedCompetitorPagesTable
              rows={h3Rows}
              emptyMessage="Requires URL-level citation data from Peec AI Pro"
            />
          )
        })()}
      </SectionCard>

      {/* ── Section I: AI Systems Interacting with Our Content (LIVE) ─────── */}
      {(() => {
        const sectionIRows: AISystemsInteractingRow[] = (agentData && bots.length > 0)
          ? bots.map(b => ({
              botId:       b.botId,
              botName:     b.botName,
              botType:     b.botType,
              totalVisits: b.totalVisits,
              uniquePages: b.uniquePages,
              successRate: b.successRate,
              lastSeen:    b.lastSeen,
            }))
          : []
        return (
          <AISystemsInteractingTable
            rows={sectionIRows}
            totalBotVisits={totalBotVisits}
            emptyMessage="No AI bot crawl data available -- check PEEC_AI_CUSTOMER_TOKEN configuration."
          />
        )
      })()}

      {/* ── Section J: Recommended Actions (PRD: 7-column data table) ─────── */}
      {(() => {
        const sectionJRows: ContentTeamRecommendationsRow[] = []
        if (calendarData && calendarData.rows.filter(r => r.matchStatus === 'unpublished').length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Unpublished planned content',
            issueOpportunity: `${calendarData.rows.filter(r => r.matchStatus === 'unpublished').length} calendar URLs not yet live`,
            evidenceType:     'Content Calendar',
            suggestedAction:  'Prioritize publishing -- planned content generates zero AI visibility until live',
            reason:           'Unpublished content earns no citations or crawls',
            priority:         'High',
            owner:            'Content',
          })
        }
        if (agentData && agentData.topPaths.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'High-crawl pages without citations',
            issueOpportunity: `${agentData.uniquePagesVisited} pages crawled by AI bots; many earn 0 citations`,
            evidenceType:     'AI Bot + Peec AI',
            suggestedAction:  'Add direct answer blocks, FAQ schema, and clearer entity definitions on top-crawled pages',
            reason:           'LLMs extract better from structured, definitional content than narrative copy',
            priority:         'Medium',
            owner:            'Content',
          })
        }
        if (filteredCompetitorDomains.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Competitor-dominated clusters',
            issueOpportunity: `${filteredCompetitorDomains.length} competitor domains cited in AI for your prompts`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Create targeted content for each competitor-dominated prompt cluster',
            reason:           'Displace competitor citations with higher-quality owned content',
            priority:         'Medium',
            owner:            'Content',
          })
        }
        if (filteredEditorialDomains.length > 0) {
          sectionJRows.push({
            urlOrTopic:       'High-cite editorial outlets w/o brand mention',
            issueOpportunity: `${filteredEditorialDomains.length} editorial domains AI cites where brand is absent`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Brief PR / editorial team to pitch contributed pieces, expert quotes, or data exclusives to these outlets',
            reason:           'Earned coverage on AI-trusted outlets compounds brand citation share',
            priority:         'Medium',
            owner:            'Content / PR',
          })
        }
        if (peecData && peecData.trackedPrompts.filter(p => p.visibility < 30).length > 0) {
          sectionJRows.push({
            urlOrTopic:       'Low-visibility tracked prompts',
            issueOpportunity: `${peecData.trackedPrompts.filter(p => p.visibility < 30).length} prompts where brand visibility < 30%`,
            evidenceType:     'Peec AI',
            suggestedAction:  'Write direct-answer pages targeting each low-visibility prompt: clear definition, comparison table, and named-entity references',
            reason:           'Direct-answer pages are the highest-yield format for LLM citation',
            priority:         'High',
            owner:            'Content',
          })
        }
        return (
          <ContentTeamRecommendationsTable
            rows={sectionJRows}
            emptyMessage="Connect content calendar and GA4 to generate URL-level recommendations"
          />
        )
      })()}

      {/* Footer */}
      <p className="text-xs text-text-muted">
        Content Impact Tracker
        {peecData && ' · Peec AI (live)'}
        {agentData && ` · ${totalBotVisits.toLocaleString()} AI bot visits (30d)`}
        {calendarData && ` · ${calendarData.plannedCount} planned URLs (content calendar)`}
        {!calendarData && ' · Content calendar pending connection'}
        {ga4Rows ? ` · GA4 page-level data (live, ${ga4Rows.length} pages)` : ' · GA4 pending service-account access'}
      </p>
    </div>
  )
}
