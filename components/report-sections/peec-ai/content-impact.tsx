import { Suspense } from 'react'
import { FileText, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { SectionHeader } from './section-header'
import { ContentImpactSynopsis } from './content-impact-synopsis'
import type { ContentImpactSynopsisContext } from '@/lib/peec/content-impact-synopsis'
import { cn } from '@/lib/utils'
import { getPeecOverview } from '@/lib/peec/client'
import type { TopDomain } from '@/lib/peec/client'
import { getAgentAnalytics } from '@/lib/peec/agent-analytics'
import { getUrlCitations, getOwnedUrlCitations, domainPromptIds, ownedPromptCoveragePctForModels, domainTagNames, avgCitationsByDomain } from '@/lib/peec/url-citations'
import { planOwnedCitations } from '@/lib/peec/owned-citations-plan'
import { getCoverageProjection, EMPTY_COVERAGE_PROJECTION } from '@/lib/peec/coverage-projection'
import { buildContentPerformanceRows, engagementRateByPath, normPath } from '@/lib/peec/content-performance-rows'
import { toCalendarPages } from '@/lib/content-calendar/pages'
import { urlJoinKey } from '@/lib/url'
import { MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'
import { sumByModel, filterDomainRowsByModel } from '@/lib/peec/by-model'
import { getContentCalendarData } from '@/lib/content-calendar/client'
import type { ContentCalendarRow } from '@/lib/content-calendar/types'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource, SHOW_AI_NARRATIVE } from '@/lib/constants'
import { median, computeUrlTiming } from '@/lib/ga4/content-derive'
import { formatDaysToFirst } from '@/lib/ga4/format-speed'
import { computeBotVsHumanScatter } from '@/lib/peec/bot-vs-human-scatter'
import { resolveScatterWindow } from '@/lib/peec/scatter-window'
import BotVsHumanScatter from '@/components/report-sections/peec-ai/bot-vs-human-scatter'
import type { SlopeChartInput } from '@/lib/peec/slope-chart'
import SlopeChart from '@/components/report-sections/peec-ai/slope-chart'
import type { ReportAudience } from './ctx'
import { ContentPerformanceTable } from './content-performance-table'
import {
  CompetitorDomainsCitedTable,
  CompetitorUrlsBrandAbsentTable,
  type CompetitorDomainsCitedRow,
  type CompetitorUrlsBrandAbsentRow,
} from './content-impact-tables'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import { computePromptGaps, DEFAULT_DECLINE_THRESHOLD, type PromptGapsResult } from '@/lib/peec/prompt-gaps'
import { isClientVisible } from '@/lib/report-sections/mutations'
import { PromptGapsBlock, PROMPT_GAPS_VIEW_KEY, PROMPT_GAPS_BLOCK_ID } from './prompt-gaps'

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
  chart = false,
  children,
}: {
  title: string
  description?: string
  /** A card holding a chart: one unbreakable block in the PDF export. */
  chart?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6" {...(chart ? { 'data-export-block': '' } : {})}>
      {/* In the PDF export the title stays on the page of what follows it. */}
      <div data-export-keep-with-next="">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  live,
  delta,
  invertDelta,
  deltaMode = 'pct',
}: {
  label: string
  value: string
  hint: string
  live?: boolean
  delta?: number
  invertDelta?: boolean
  /** 'pp' = percentage-point change (absolute); 'pct' = relative percent change. Default: 'pct'. */
  deltaMode?: 'pp' | 'pct'
}) {
  const positive = invertDelta ? (delta != null && delta <= 0) : (delta != null && delta >= 0)
  const deltaSuffix = deltaMode === 'pp' ? 'pp' : '%'
  return (
    <div className="rounded-xl border border-white/[0.08] bg-bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn('mt-2 text-2xl font-bold tabular-nums', live ? 'text-white' : 'text-white/20')}>
        {value}
      </p>
      {delta !== undefined && (
        <p className={cn('mt-1 text-sm font-bold', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
          {positive ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}{deltaSuffix} vs previous period
        </p>
      )}
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
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

/** Section C's four cards. In the PDF export the Fastest and Slowest URLs, which are the answer, print in full (the theme
 *  un-truncates inside data-export-wrap) and break anywhere, since a URL has no spaces; live they stay one truncated line. */
export function TimeToFirstCards({ medFirstSearch, medFirstAi, fastestAi, slowestAi, fastestAiUrl, slowestAiUrl }: {
  medFirstSearch: number | null
  medFirstAi: number | null
  fastestAi: number | null
  slowestAi: number | null
  fastestAiUrl: string | null
  slowestAiUrl: string | null
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-export-block="" data-export-wrap="">
      {[
        { icon: Clock, label: 'Median days to first search visit',     color: '#39A0FF', val: medFirstSearch, sourceUrl: null as string | null },
        { icon: Clock, label: 'Median days to first AI-referred visit', color: '#60FDFF', val: medFirstAi, sourceUrl: null as string | null },
        { icon: TrendingUp,   label: 'Fastest to first AI-referred visit',  color: '#60FF80', val: fastestAi, sourceUrl: fastestAiUrl },
        { icon: TrendingDown, label: 'Slowest to first AI-referred visit',  color: '#FF4444', val: slowestAi, sourceUrl: slowestAiUrl },
      ].map(({ icon: Icon, label, color, val, sourceUrl }) => (
        <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <Icon className="h-4 w-4" style={{ color }} />
          <span className="text-[11px] font-semibold text-text-muted">{label}</span>
          <span className={cn('text-lg font-bold', val !== null ? 'text-white' : 'text-white/20')}>
            {formatDaysToFirst(val)}
          </span>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-full truncate wrap-anywhere text-[10px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
              title={sourceUrl}
            >
              {sourceUrl}
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

export async function ContentImpactReport({
  clientSlug,
  dateRange,
  compareRange,
  models,
  audience,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string
  models?: AEOModel[] | null
  /** Who the report is for. Required so every caller states it; gates the internal-only prompt gaps block. */
  audience: ReportAudience
}) {
  const effectiveRange = dateRange ?? 'last_30_days'

  // FB-034: derive compare-period ISO ranges. compareRange is passed by
  // the page router when the user explicitly turns on a comparison
  // period via the date picker. When compareRange is not passed, prior
  // data is not fetched and KPI cards render their value with no delta
  // line (Tina's literal ask: deltas show "when you have a comparison
  // period turned on", not always).
  const mainRangeStr = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(mainRangeStr)
  const mainIso = `${mainDates.startDate},${mainDates.endDate}`
  // FB-035 hotfix: compareRange from the URL is a magic string like
  // 'previous_period'. parseDateRange does NOT handle that and falls
  // through to its default (last 30 days), making prior == main and
  // every delta read as 0. deriveCompareRange is the codebase pattern
  // every other tab uses; mirror it here.
  const compareDates = compareRange ? deriveCompareRange(mainRangeStr, compareRange) : null
  const compareIso = compareDates ? `${compareDates.startDate},${compareDates.endDate}` : null

  // FB-048/CI-3c: §D scatter human-axis window. Peec bot data (agentData.byPath)
  // only retains the last 30 days, so it always stays a rolling last-30 window.
  // The human-axis GA4 window used to be hardcoded to that same last-30 window
  // regardless of the page date picker. resolveScatterWindow follows the picker
  // when the selected range fits inside the last 30 days, and falls back to the
  // last-30 window otherwise (same as the prior unconditional behavior).
  const scatterToday = new Date().toISOString().slice(0, 10)
  const scatterWindow = resolveScatterWindow(mainDates, scatterToday)

  const previousPeriodDates = deriveCompareRange(mainRangeStr, 'previous_period')

  const [
    peecResult,
    agentResult,
    calendarResult,
    ga4Result,
    urlCitationsResult,
    coverageResult,
    ga4AiHostResult,
    ga4AiPathResult,
    ga4TrafficMainResult,
    ga4TrafficPriorResult,
    urlCitationsPriorResult,
    coveragePriorResult,
    ga4PerPathPriorResult,
    ga4AiPathPriorResult,
    ga4ChannelMainResult,
    ga4ChannelPriorResult,
    ga4ScatterResult,
    clientRowResult,
    sessionResult,
    coverageGapsPriorResult,
  ] = await Promise.allSettled([
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
    // CI-1: pass the selected date range (was called bare, hard-locked to a
    // rolling last-30 window) so the Prompt Coverage KPI value itself moves
    // with the page date picker, matching every other date-reactive metric.
    getCoverageProjection(clientSlug, { startDate: mainDates.startDate, endDate: mainDates.endDate }),  // per-domain prompt/theme coverage (Section H)
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
    // FB-034: sessionSource × sessionDefaultChannelGroup for §A KPI cards.
    // Single shape, run for both main + prior so we can compute AI Referral
    // Traffic and Organic Traffic + their deltas off two queries instead of
    // four. limit 1000 because (source × channel-group) cardinality is small.
    clientSlug
      ? ga4Query({
          clientSlug,
          dateRange: mainIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource', 'sessionDefaultChannelGroup'],
          limit: 1000,
        })
      : Promise.resolve(null),
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource', 'sessionDefaultChannelGroup'],
          limit: 1000,
        })
      : Promise.resolve(null),
    // FB-035 §B prior-period url-citations (Citation Share delta + AI Citations prior)
    compareIso
      ? getUrlCitations(clientSlug, { startDate: compareDates!.startDate, endDate: compareDates!.endDate })
      : Promise.resolve([] as Awaited<ReturnType<typeof getUrlCitations>>),
    // FB-035 §B prior-period coverage (Prompt Coverage delta)
    compareIso
      ? getCoverageProjection(clientSlug, { startDate: compareDates!.startDate, endDate: compareDates!.endDate })
      : Promise.resolve(EMPTY_COVERAGE_PROJECTION),
    // FB-035 §B prior-period per-path full-metrics (Engagement Rate prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
          dimensions: ['pagePath'],
          limit: 1000,
        })
      : Promise.resolve(null),
    // FB-035 §B prior-period per-path × source (AI Referral Traffic per-page prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionSource'],
          limit: 2000,
        })
      : Promise.resolve(null),
    // FB-035 §B current-period per-path × channel-group (Organic Sessions per page, current)
    clientSlug
      ? ga4Query({
          clientSlug,
          dateRange: mainIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionDefaultChannelGroup'],
          limit: 2000,
        })
      : Promise.resolve(null),
    // FB-035 §B prior-period per-path × channel-group (Organic Sessions per page, prior)
    clientSlug && compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['pagePath', 'sessionDefaultChannelGroup'],
          limit: 2000,
        })
      : Promise.resolve(null),
    // FB-048/CI-3c §D: GA4 page-level sessions for the scatter's human axis.
    // Window comes from resolveScatterWindow: follows the page date picker when
    // the selected range is within the last 30 days, otherwise falls back to
    // the last-30-days window to match the Peec agent-analytics window (also
    // last-30-days at lib/peec/agent-analytics.ts:284, which cannot be widened).
    ga4Query({
      clientSlug,
      dateRange: `${scatterWindow.start_date},${scatterWindow.end_date}`,
      metrics: ['sessions'],
      dimensions: ['pagePath', 'sessionSource'],
      limit: 1000,
    }),
    getClientBySlug(clientSlug), // React.cache-memoized; prompt-gaps visibility + decline threshold
    auth(),                      // INTERNAL_ADMIN gets the visibility switch
    // D-16: prompt gaps always compare to the previous period. Reuse the compare-period
    // projection when that's what the toggle selected, else fetch it here (same batch).
    compareRange !== 'previous_period' && previousPeriodDates
      ? getCoverageProjection(clientSlug, previousPeriodDates)
      : Promise.resolve(null),
  ])

  let peecData     = peecResult.status     === 'fulfilled' ? peecResult.value     : null
  let agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null
  let calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : null
  let ga4Rows      = ga4Result.status      === 'fulfilled' ? ga4Result.value.rows : null
  let urlCitations = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
  let coverage     = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : EMPTY_COVERAGE_PROJECTION
  const citationsOk = urlCitationsResult.status === 'fulfilled'
  // GA4 host×source rows (§A totals + §F per-host AI-referred). null when the
  // query rejected (GA4 unconfigured / property not shared) → callers reserve
  // -- for that case, 0 stays 0.
  const ga4AiHostRows = ga4AiHostResult.status === 'fulfilled' ? ga4AiHostResult.value.rows : null
  const ga4AiPathRows = ga4AiPathResult.status === 'fulfilled' ? ga4AiPathResult.value.rows : null

  // FB-034: §A KPI source rows. null = query rejected or no compareRange;
  // each derived KPI uses its own ok-check (aiPriorAvailable, organicPriorAvailable)
  // to distinguish "no prior available" from "real zero".
  const ga4TrafficMainRows = ga4TrafficMainResult.status === 'fulfilled' && ga4TrafficMainResult.value
    ? ga4TrafficMainResult.value.rows
    : null
  const ga4TrafficPriorRows = ga4TrafficPriorResult.status === 'fulfilled' && ga4TrafficPriorResult.value
    ? ga4TrafficPriorResult.value.rows
    : null

  // FB-035 §B prior-period url-citations rows. Empty array = no compareIso; null deltas handled downstream.
  const urlCitationsPrior = urlCitationsPriorResult.status === 'fulfilled' ? urlCitationsPriorResult.value : []
  // FB-035 §B prior-period coverage. Empty shape = no compareIso.
  const coveragePrior = coveragePriorResult.status === 'fulfilled'
    ? coveragePriorResult.value
    : EMPTY_COVERAGE_PROJECTION
  // FB-035 §B prior-period per-path full-metrics (used for Engagement Rate prior).
  const ga4PerPathPriorRows = ga4PerPathPriorResult.status === 'fulfilled' && ga4PerPathPriorResult.value
    ? ga4PerPathPriorResult.value.rows
    : null
  // FB-035 §B prior-period per-path × source (used for AI Referral Traffic per-page prior).
  const ga4AiPathPriorRows = ga4AiPathPriorResult.status === 'fulfilled' && ga4AiPathPriorResult.value
    ? ga4AiPathPriorResult.value.rows
    : null
  // FB-035 §B current-period per-path × channel-group (used for Organic Sessions per page current).
  const ga4ChannelMainRows = ga4ChannelMainResult.status === 'fulfilled' && ga4ChannelMainResult.value
    ? ga4ChannelMainResult.value.rows
    : null
  // FB-035 §B prior-period per-path × channel-group (used for Organic Sessions per page prior).
  const ga4ChannelPriorRows = ga4ChannelPriorResult.status === 'fulfilled' && ga4ChannelPriorResult.value
    ? ga4ChannelPriorResult.value.rows
    : null
  // FB-037 §D: hardcoded last-30-days page×source rows for the scatter chart.
  const ga4ScatterRows = ga4ScatterResult.status === 'fulfilled' ? ga4ScatterResult.value.rows : null
  if (ga4ScatterResult.status === 'rejected') console.error('[content-impact] GA4 §D scatter error:', ga4ScatterResult.reason)

  if (peecResult.status         === 'rejected') console.error('[content-impact] Peec error:', peecResult.reason)
  if (agentResult.status        === 'rejected') console.error('[content-impact] Agent analytics error:', agentResult.reason)
  if (calendarResult.status     === 'rejected') console.error('[content-impact] Content calendar error:', calendarResult.reason)
  if (ga4Result.status          === 'rejected') console.error('[content-impact] GA4 error:', ga4Result.reason)
  if (ga4AiHostResult.status    === 'rejected') console.error('[content-impact] GA4 host/source error:', ga4AiHostResult.reason)
  if (ga4AiPathResult.status    === 'rejected') console.error('[content-impact] GA4 path/source error:', ga4AiPathResult.reason)
  if (urlCitationsResult.status === 'rejected') console.error('[content-impact] URL citations error:', urlCitationsResult.reason)
  if (ga4TrafficMainResult.status  === 'rejected') console.error('[content-impact] GA4 §A traffic main error:', ga4TrafficMainResult.reason)
  if (ga4TrafficPriorResult.status === 'rejected') console.error('[content-impact] GA4 §A traffic prior error:', ga4TrafficPriorResult.reason)
  if (urlCitationsPriorResult.status === 'rejected') console.error('[content-impact] URL citations prior error:', urlCitationsPriorResult.reason)
  if (coveragePriorResult.status    === 'rejected') console.error('[content-impact] Coverage prior error:', coveragePriorResult.reason)
  if (ga4PerPathPriorResult.status  === 'rejected') console.error('[content-impact] GA4 per-path prior error:', ga4PerPathPriorResult.reason)
  if (ga4AiPathPriorResult.status   === 'rejected') console.error('[content-impact] GA4 AI per-path prior error:', ga4AiPathPriorResult.reason)
  if (ga4ChannelMainResult.status   === 'rejected') console.error('[content-impact] GA4 channel-group main error:', ga4ChannelMainResult.reason)
  if (ga4ChannelPriorResult.status  === 'rejected') console.error('[content-impact] GA4 channel-group prior error:', ga4ChannelPriorResult.reason)

  // ── Derived metrics ────────────────────────────────────────────────────────
  const ownDomains        = (peecData?.topDomains ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.topDomains ?? []).filter(d => d.type === 'Competitor')

  // Merged content table (D-5): owned hosts only exist once Peec's overview
  // resolves, so this is a second awaited fetch after the main batch. Sorted
  // because the host list is part of getOwnedUrlCitations's cache key.
  const { owned: ownedCitations, ownedPrior: ownedCitationsPrior } = await planOwnedCitations({
    clientSlug,
    ownedHosts: ownDomains.map(d => d.domain),
    dateRange: mainRangeStr,
    compareDates,
    fetcher: getOwnedUrlCitations,
    onError: (which, reason) => console.error(`[content-impact] Owned URL citations ${which} error:`, reason),
  })

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
  // For Peec citation tables: when a model filter is active, recompute citationCount
  // from per-model data and apply through filterDomainRowsByModel. Falls back to
  // unfiltered domain list when no filter is set.
  const filteredOwnDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        ownDomains,
        peecData.domainCitationsByModel,
        models ?? null,
      )
    : ownDomains

  const filteredCompetitorDomains: TopDomain[] = peecData?.domainCitationsByModel
    ? filterDomainRowsByModel(
        competitorDomains,
        peecData.domainCitationsByModel,
        models ?? null,
      )
    : competitorDomains

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
  const coveragePriorAvailable =
    Object.keys(coveragePrior.promptIdsByDomain).length > 0 ||
    Object.keys(coveragePrior.tagIdsByDomain).length > 0
  const getPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalTrackedPrompts * 100)
      : null
  // FB-040: prior-period mirror of getPromptCoverage. Uses the same
  // totalTrackedPrompts denominator (tracked-prompt list is configuration,
  // not period-dependent). Returns null when prior coverage is unavailable
  // so the delta in §H.1 stays null and renders nothing.
  const getPromptCoveragePrior = (domain: string): number | null =>
    coveragePriorAvailable && totalTrackedPrompts > 0
      ? Math.round(domainPromptIds(coveragePrior, domain).length / totalTrackedPrompts * 100)
      : null

  // Citation-count-weighted avg citations-per-answer per domain (§F owned pages).
  // host key is www-stripped + lowercased to match avgCitationsByDomain()/domainTagNames().
  const hostKey = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  const avgCitByDomain = avgCitationsByDomain(urlCitations)

  // ── GA4 derivations (§A glance totals, §F per-host) ──────────────────────────
  // 0-vs-no-data rule (#35): when the query resolved, a 0 is a real 0; -- is
  // reserved for a rejected query (handled by the *Ok booleans below).
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

  // ── §C · time-to-first search visit / AI-referred visit (D-1, D-9) ───────────
  // Universe: published, New (or New · Optimized) Avenue Z pages with a publish
  // date, measured from publishDate. One date-bucketed GA4 query restricted to
  // those paths, from the earliest publish date to today. Gated on the content
  // calendar: without publish dates there is no URL spine to measure.
  // ── Merged content performance table (D-5, D-17, D-18, D-19) ───────────────
  const primaryOwnedDomain = (ownDomains[0]?.domain ?? '')
    .trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '') || null
  const calendarPages = toCalendarPages(calendarData?.rows ?? [], primaryOwnedDomain)
  const plannedTiming = calendarPages
    .filter(p => p.published && (p.badge === 'new' || p.badge === 'new-optimized') && p.publishDate)
    .map(p => ({ path: extractPath(p.url), url: p.url, publishDate: p.publishDate as string }))
    .filter((r): r is { path: string; url: string; publishDate: string } => r.path !== null)

  const daysByPath = new Map<string, Map<string, { aiSessions: number; searchSessions: number }>>()
  let timingOk = false
  if (plannedTiming.length > 0) {
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
        dimensions: ['pagePath', 'date', 'sessionSource', 'sessionDefaultChannelGroup'],
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
        const acc = byDate.get(iso) ?? { aiSessions: 0, searchSessions: 0 }
        if (isAiSource(row.sessionSource)) acc.aiSessions += sessions
        if (String(row.sessionDefaultChannelGroup ?? '') === 'Organic Search') acc.searchSessions += sessions
        byDate.set(iso, acc)
      }
    } catch (e) {
      console.error('[content-impact] GA4 §C timing error:', e)
    }
  }

  const daysFor = (path: string) =>
    [...(daysByPath.get(normPath(path))?.entries() ?? [])].map(([date, v]) => ({ date, ...v }))

  const urlTimings = plannedTiming.map(r => ({
    url: r.url,
    ...computeUrlTiming({ publishDate: r.publishDate, days: daysFor(r.path) }),
  }))

  // §C aggregates (median days-to-first; fastest/slowest AI-referred).
  const firstSearchDays = urlTimings.map(t => t.daysToFirstSearch).filter((n): n is number => n !== null)
  const firstAiDays = urlTimings.map(t => t.daysToFirstAi).filter((n): n is number => n !== null)
  const medFirstSearch = median(firstSearchDays)
  const medFirstAi = median(firstAiDays)
  const fastestAi = firstAiDays.length ? Math.min(...firstAiDays) : null
  const slowestAi = firstAiDays.length ? Math.max(...firstAiDays) : null
  const fastestAiUrl = fastestAi !== null
    ? urlTimings.find(t => t.daysToFirstAi === fastestAi)?.url ?? null
    : null
  const slowestAiUrl = slowestAi !== null
    ? urlTimings.find(t => t.daysToFirstAi === slowestAi)?.url ?? null
    : null
  const sectionCOk = timingOk

  // ── §D · Bot vs Human scatter (FB-037, window fix FB-048/CI-3c) ──────────────
  // Build per-path maps. Bot side comes from agentData.byPath, always the last
  // 30 days (Peec retention, cannot be widened). Human side comes from
  // ga4ScatterRows, fetched over scatterWindow: the page date picker's range
  // when it fits inside the last 30 days (scatterWindow.locked === false), or
  // the same last-30 window as the bot side otherwise. Both maps are keyed by
  // urlJoinKey so a (pagePath, request_path) pair joins.
  const pathBots = new Map<string, number>()
  if (agentData) {
    for (const [k, agg] of Object.entries(agentData.byPath)) {
      pathBots.set(k, agg.totalVisits)
    }
  }
  const pathHumans = new Map<string, number>()
  if (ga4ScatterRows) {
    for (const row of ga4ScatterRows) {
      if (isAiSource(String(row.sessionSource ?? ''))) continue
      const k = urlJoinKey(String(row.pagePath ?? ''))
      if (!k) continue
      pathHumans.set(k, (pathHumans.get(k) ?? 0) + (Number(row.sessions) || 0))
    }
  }
  const scatterData = computeBotVsHumanScatter({ pathBots, pathHumans })

  // ── §E · Slope chart inputs (FB-038) ─────────────────────────────────────────
  // Build per-path / per-url maps for all 3 metrics x 2 periods. All source
  // vars (ga4AiPathRows, ga4AiPathPriorRows, ga4ChannelMainRows,
  // ga4ChannelPriorRows, urlCitations, urlCitationsPrior) come from FB-035 and
  // are already in scope. The chart itself is compare-period gated; when
  // compareIso is null the prior arrays are empty and the component shows its
  // empty state.

  // AI Referral Traffic per page: sessions where isAiSource(sessionSource), per pagePath.
  const slopeAiReferralByPath = new Map<string, [number, number]>()
  const accAiCurrent = new Map<string, number>()
  if (ga4AiPathRows) {
    for (const r of ga4AiPathRows) {
      if (!isAiSource(r.sessionSource)) continue
      const k = urlJoinKey(String(r.pagePath ?? ''))
      if (!k) continue
      accAiCurrent.set(k, (accAiCurrent.get(k) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  const accAiPrior = new Map<string, number>()
  if (ga4AiPathPriorRows) {
    for (const r of ga4AiPathPriorRows) {
      if (!isAiSource(r.sessionSource)) continue
      const k = urlJoinKey(String(r.pagePath ?? ''))
      if (!k) continue
      accAiPrior.set(k, (accAiPrior.get(k) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  for (const k of new Set<string>([...accAiCurrent.keys(), ...accAiPrior.keys()])) {
    slopeAiReferralByPath.set(k, [accAiPrior.get(k) ?? 0, accAiCurrent.get(k) ?? 0])
  }

  // Organic Search Traffic per page: sessions where channel === 'Organic Search'.
  const slopeOrganicByPath = new Map<string, [number, number]>()
  const accOrgCurrent = new Map<string, number>()
  if (ga4ChannelMainRows) {
    for (const r of ga4ChannelMainRows) {
      if (String(r.sessionDefaultChannelGroup ?? '') !== 'Organic Search') continue
      const k = urlJoinKey(String(r.pagePath ?? ''))
      if (!k) continue
      accOrgCurrent.set(k, (accOrgCurrent.get(k) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  const accOrgPrior = new Map<string, number>()
  if (ga4ChannelPriorRows) {
    for (const r of ga4ChannelPriorRows) {
      if (String(r.sessionDefaultChannelGroup ?? '') !== 'Organic Search') continue
      const k = urlJoinKey(String(r.pagePath ?? ''))
      if (!k) continue
      accOrgPrior.set(k, (accOrgPrior.get(k) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  for (const k of new Set<string>([...accOrgCurrent.keys(), ...accOrgPrior.keys()])) {
    slopeOrganicByPath.set(k, [accOrgPrior.get(k) ?? 0, accOrgCurrent.get(k) ?? 0])
  }

  // Citation Share per URL: (urlCitationCount / periodTotalCitations) * 100,
  // per period independently. Period total = sum of urlCitations citationCount.
  const slopeCitationShareByUrlKey = new Map<string, { prior: number; current: number; url: string }>()
  const totalCurrentCitations = urlCitations.reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
  const totalPriorCitations   = urlCitationsPrior.reduce((s, c) => s + (Number(c.citationCount) || 0), 0)
  const currentByUrlKey = new Map<string, { count: number; url: string }>()
  for (const c of urlCitations) {
    if (!c.urlKey) continue
    currentByUrlKey.set(c.urlKey, { count: Number(c.citationCount) || 0, url: c.url })
  }
  const priorByUrlKey = new Map<string, { count: number; url: string }>()
  for (const c of urlCitationsPrior) {
    if (!c.urlKey) continue
    priorByUrlKey.set(c.urlKey, { count: Number(c.citationCount) || 0, url: c.url })
  }
  for (const k of new Set<string>([...currentByUrlKey.keys(), ...priorByUrlKey.keys()])) {
    const cur = currentByUrlKey.get(k)
    const pri = priorByUrlKey.get(k)
    const currentShare = (cur && totalCurrentCitations > 0) ? (cur.count / totalCurrentCitations) * 100 : 0
    const priorShare   = (pri && totalPriorCitations > 0)   ? (pri.count / totalPriorCitations)   * 100 : 0
    const url = cur?.url ?? pri?.url ?? k
    slopeCitationShareByUrlKey.set(k, { prior: priorShare, current: currentShare, url })
  }

  const slopeInput: SlopeChartInput = {
    aiReferralByPath:      slopeAiReferralByPath,
    organicByPath:         slopeOrganicByPath,
    citationShareByUrlKey: slopeCitationShareByUrlKey,
  }
  const slopeCompareActive = compareIso !== null

  // ── FB-034 · §A Snapshot KPI derivations (Tina's 4 new metrics) ─────────────

  // Helper: sessions sum across rows filtered by predicate. Returns null only
  // when rows itself is null (query rejected); 0 means "real zero".
  const sumSessions = (
    rows: typeof ga4TrafficMainRows,
    pred: (r: { sessionSource?: unknown; sessionDefaultChannelGroup?: unknown }) => boolean,
  ): number | null => {
    if (rows === null) return null
    return rows.filter(pred).reduce((s, r) => s + (Number(r.sessions) || 0), 0)
  }

  const isAiRow = (r: { sessionSource?: unknown }) =>
    isAiSource(String(r.sessionSource ?? ''))
  const isOrganicRow = (r: { sessionDefaultChannelGroup?: unknown }) =>
    String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search'

  // KPI 1: Citation Share. Mirror Overview's definition (peec-ai/index.tsx:188).
  // Numerator: peecData.yourBrandCitations. Denominator: peecData.totalCitations.
  // Prior values come from peecData.yourBrandCitationsPrior + .totalCitationsPrior.
  const totalCitationsAllDomains = peecData?.totalCitations ?? 0
  const yourBrandCitations = peecData?.yourBrandCitations ?? 0
  const citationSharePct = totalCitationsAllDomains > 0
    ? (yourBrandCitations / totalCitationsAllDomains) * 100
    : null
  const yourBrandCitationsPrior = peecData?.yourBrandCitationsPrior ?? null
  const totalCitationsPrior = peecData?.totalCitationsPrior ?? null
  const citationSharePctPrior =
    yourBrandCitationsPrior != null && totalCitationsPrior != null && totalCitationsPrior > 0
      ? (yourBrandCitationsPrior / totalCitationsPrior) * 100
      : null
  const citationSharePctDelta =
    citationSharePct != null && citationSharePctPrior != null
      ? citationSharePct - citationSharePctPrior
      : null

  // KPI 2: Prompt Coverage. Percent of tracked prompts citing any owned domain
  // (union of prompt IDs across owned domains). Prior period uses the same
  // definition over coveragePrior (FB-035 added the dateRange parameter to
  // getDomainCoverage), enabling the period-over-period delta below.
  // CI-1: both current and prior now go through the model-aware helper so
  // the value (not just its delta) reacts to the selected AI model filter.
  // With models null/empty this is identical to ownedPromptCoveragePct.
  const ownedDomainNames = ownDomains.map(d => d.domain)
  const promptCoveragePct = ownedPromptCoveragePctForModels(
    coverage, ownedDomainNames, totalTrackedPrompts, models ?? null, coverageAvailable,
  )
  const promptCoveragePctPrior = ownedPromptCoveragePctForModels(
    coveragePrior, ownedDomainNames, totalTrackedPrompts, models ?? null, coveragePriorAvailable,
  )
  const promptCoveragePctDelta =
    promptCoveragePct != null && promptCoveragePctPrior != null
      ? promptCoveragePct - promptCoveragePctPrior
      : null

  // KPI 3: AI Referral Traffic. Same definition as the current §A KPI #5
  // (ga4AiReferredSessions), sourced from the new sessionSource ×
  // sessionDefaultChannelGroup query so prior-period is available in one
  // place. Delta = ((current - prior) / prior) * 100 when prior > 0.
  const aiReferralTraffic = sumSessions(ga4TrafficMainRows, isAiRow)
  const aiReferralTrafficPrior = sumSessions(ga4TrafficPriorRows, isAiRow)
  const aiReferralTrafficDelta =
    aiReferralTraffic != null && aiReferralTrafficPrior != null && aiReferralTrafficPrior > 0
      ? ((aiReferralTraffic - aiReferralTrafficPrior) / aiReferralTrafficPrior) * 100
      : null

  // KPI 4: Organic Traffic. GA4's "Organic Search" channel grouping,
  // includes Google, Bing, etc. organic search but excludes paid search,
  // direct, referral, AI sources. Delta same as AI Referral Traffic.
  const organicTraffic = sumSessions(ga4TrafficMainRows, isOrganicRow)
  const organicTrafficPrior = sumSessions(ga4TrafficPriorRows, isOrganicRow)
  const organicTrafficDelta =
    organicTraffic != null && organicTrafficPrior != null && organicTrafficPrior > 0
      ? ((organicTraffic - organicTrafficPrior) / organicTrafficPrior) * 100
      : null

  // Booleans for the delta-rendering gate. Tina's literal ask was deltas
  // show "when you have a comparison period turned on", which means
  // explicit toggle via the date picker. We gate ALL deltas (including
  // Peec-driven Citation Share, which would otherwise show unconditionally
  // because Peec returns prior values regardless of compareRange) on the
  // user having explicitly turned on a comparison period (compareIso non-null).
  // Truth-grounded: no fake "+0%" and no delta when the user did not opt in.
  const compareActive = compareIso !== null
  const aiPriorAvailable = compareActive && aiReferralTrafficPrior !== null
  const organicPriorAvailable = compareActive && organicTrafficPrior !== null
  const citationSharePriorAvailable = compareActive && citationSharePctPrior !== null
  const promptCoveragePriorAvailable = compareActive && promptCoveragePctPrior !== null

  // ── FB-035 · §B Watched Pages: per-row metrics × current/prior + deltas ─────

  // Total AI citations across all URLs in this period; denominator for Citation Share %.
  const sumCitations = (rows: typeof urlCitations) =>
    rows.reduce((s, c) => s + (c.citationCount || 0), 0)
  const totalCitationsCurrentRows = sumCitations(urlCitations)
  const totalCitationsPriorRows = sumCitations(urlCitationsPrior)
  const citeByKeyPrior = new Map(urlCitationsPrior.map((c) => [c.urlKey, c]))

  // Per-path AI sessions (prior). Mirror the current-period builder ga4AiPathRows
  // logic (content-impact.tsx around line 459-467) but against prior rows.
  const aiPathPriorOk = ga4AiPathPriorRows !== null
  const aiRefByPathPrior = new Map<string, number>()
  if (aiPathPriorOk) {
    for (const r of ga4AiPathPriorRows!) {
      if (!isAiSource(String(r.sessionSource ?? ''))) continue
      const p = normPath(String(r.pagePath ?? ''))
      aiRefByPathPrior.set(p, (aiRefByPathPrior.get(p) ?? 0) + (Number(r.sessions) || 0))
    }
  }
  const ga4PriorPathSet = new Set((ga4PerPathPriorRows ?? []).map((r) => normPath(String(r.pagePath ?? ''))))
  const aiReferredForPathPrior = (path: string | null): number | null => {
    if (!aiPathPriorOk || !path) return null
    const np = normPath(path)
    if (!ga4PriorPathSet.has(np)) return null
    return aiRefByPathPrior.get(np) ?? 0
  }

  // Per-path organic sessions (current). channel-group dimension; sum where group === 'Organic Search'.
  const channelMainOk = ga4ChannelMainRows !== null
  const organicByPath = new Map<string, number>()
  const ga4ChannelPathSet = new Set<string>()
  if (channelMainOk) {
    for (const r of ga4ChannelMainRows!) {
      const p = normPath(String(r.pagePath ?? ''))
      if (p) ga4ChannelPathSet.add(p)
      if (String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search') {
        organicByPath.set(p, (organicByPath.get(p) ?? 0) + (Number(r.sessions) || 0))
      }
    }
  }
  const organicForPath = (path: string | null): number | null => {
    if (!channelMainOk || !path) return null
    const np = normPath(path)
    if (!ga4ChannelPathSet.has(np)) return null
    return organicByPath.get(np) ?? 0
  }

  // Per-path organic sessions (prior).
  const channelPriorOk = ga4ChannelPriorRows !== null
  const organicByPathPrior = new Map<string, number>()
  const ga4ChannelPriorPathSet = new Set<string>()
  if (channelPriorOk) {
    for (const r of ga4ChannelPriorRows!) {
      const p = normPath(String(r.pagePath ?? ''))
      if (p) ga4ChannelPriorPathSet.add(p)
      if (String(r.sessionDefaultChannelGroup ?? '') === 'Organic Search') {
        organicByPathPrior.set(p, (organicByPathPrior.get(p) ?? 0) + (Number(r.sessions) || 0))
      }
    }
  }
  const organicForPathPrior = (path: string | null): number | null => {
    if (!channelPriorOk || !path) return null
    const np = normPath(path)
    if (!ga4ChannelPriorPathSet.has(np)) return null
    return organicByPathPrior.get(np) ?? 0
  }

  // Per-path engagement rate, session-weighted across a path's trailing-slash
  // variants (D-17). null when GA4 was not queried successfully.
  const erRows = (rows: import('@/lib/ga4/types').GA4Row[]) =>
    rows.map(r => ({ pagePath: r.pagePath, sessions: r.sessions, engagementRate: r.engagementRate }))
  const erByPath = ga4Rows ? engagementRateByPath(erRows(ga4Rows)) : null
  const erByPathPrior = ga4PerPathPriorRows ? engagementRateByPath(erRows(ga4PerPathPriorRows)) : null

  // A rejected coverage walk must render --, not 0%: EMPTY is "complete", so flag it incomplete.
  const rowsCoverage = coverageResult.status === 'fulfilled'
    ? coverage
    : { ...EMPTY_COVERAGE_PROJECTION, complete: false }
  const rowsCoveragePrior = compareIso && coveragePriorResult.status === 'fulfilled' ? coveragePrior : null
  const contentPerformanceRows = buildContentPerformanceRows({
    pages: calendarPages,
    owned: ownedCitations,
    ownedPrior: ownedCitationsPrior,
    coverage: rowsCoverage,
    coveragePrior: rowsCoveragePrior,
    totalTrackedPrompts,
    current: (path) => ({
      aiReferred: aiReferredForPath(path),
      organic: organicForPath(path),
      engagementRate: erByPath ? erByPath.get(normPath(path)) ?? null : null,
    }),
    prior: compareIso
      ? (path) => ({
          aiReferred: aiReferredForPathPrior(path),
          organic: organicForPathPrior(path),
          engagementRate: erByPathPrior ? erByPathPrior.get(normPath(path)) ?? null : null,
        })
      : null,
  })

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

  // Top 3 owned domains by AI citation count (real integer counts, FB-051).
  const topOwnedForSynopsis = filteredOwnDomains
    .slice()
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationCount ?? 0 }))

  // Top 3 competitor domains by AI citation count.
  const topCompetitorForSynopsis = filteredCompetitorDomains
    .slice()
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationCount ?? 0 }))

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
    // FB-034 §A KPI values, same expressions the KPI cards render.
    citationSharePct,
    citationSharePctDelta,
    promptCoveragePct,
    aiReferralTraffic,
    aiReferralTrafficDelta,
    organicTraffic,
    organicTrafficDelta,
    // Supporting context, prose grounding + validator inputs.
    totalAiCitations: totalCitations,
    yourBrandCitations,
    totalCitationsAllDomains,
    ownedDomainsCited: filteredOwnDomains.length,
    // Top-items lists (unchanged from FB-033).
    topOwnedDomainsByCitations: topOwnedForSynopsis,
    topCompetitorDomainsByCitations: topCompetitorForSynopsis,
    topBrandAbsentCompetitorUrls: topBrandAbsentForSynopsis,
    brandAbsentCompetitorUrlCount: brandAbsentUrlsForSynopsis.length,
  }

  // ── Prompt gaps (internal by default, D-4) ────────────────────────────────
  // For a client viewer with the block off, nothing is computed, so no prompt text
  // can reach the page or any client component.
  const gapsConfig = clientRowResult.status === 'fulfilled' ? clientRowResult.value?.reportSectionConfig : null
  const gapsClientVisible = isClientVisible(gapsConfig, PROMPT_GAPS_VIEW_KEY, PROMPT_GAPS_BLOCK_ID)
  const gapsSession = sessionResult.status === 'fulfilled' ? sessionResult.value : null
  const canToggleGaps = audience === 'internal' && gapsSession?.user?.role === 'INTERNAL_ADMIN'
  let promptGaps: PromptGapsResult | null = null
  if (peecData && !(audience === 'client' && !gapsClientVisible)) {
    const gapsPrevious = compareRange === 'previous_period'
      ? (coveragePriorResult.status === 'fulfilled' ? coveragePriorResult.value : null)
      : (coverageGapsPriorResult.status === 'fulfilled' ? coverageGapsPriorResult.value : null)
    if (coverageResult.status !== 'fulfilled' || !gapsPrevious) {
      promptGaps = { ok: false, reason: 'unavailable' }
    } else {
      promptGaps = computePromptGaps({
        prompts: peecData.trackedPrompts,
        coverage: coverageResult.value,
        coveragePrevious: gapsPrevious,
        models: models && models.length > 0 ? models : null,
        declineThreshold: gapsConfig?.[PROMPT_GAPS_VIEW_KEY]?.thresholds?.['prompt-gaps.decline'] ?? DEFAULT_DECLINE_THRESHOLD,
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      <SharedPartsHeader viewKey="peec-ai:content-impact" clientSlug={clientSlug} />

      <SectionHeader
        icon={FileText}
        title="How is content performing across AI and human channels?"
        subtitle="Which content assets earn LLM citations, where content investments translate into AI visibility, and what the content team should build next."
      />

      {/* ── FB-033 · Executive Synopsis (AI-generated, Glean-backed) ────────── */}
      {SHOW_AI_NARRATIVE && (
        <Suspense
          fallback={
            <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6" data-export-pending="">
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
      )}

      {/* ── Section A: KPI Strip (FB-034, Tina's 4 new metrics) ─────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted" data-export-keep-with-next="">How is content performing at a glance?</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-export-block="">
          {/* KPI 1 · Citation Share */}
          <KpiCard
            label="Citation Share"
            hint={`Owned share of total AI citations${models ? ' · filtered to selected AI models' : ''}`}
            value={
              citationSharePct !== null ? `${citationSharePct.toFixed(1)}%`
                : 'None'
            }
            live={citationSharePct !== null}
            delta={
              citationSharePriorAvailable && citationSharePctDelta !== null ? citationSharePctDelta
                : undefined
            }
            deltaMode="pp"
          />
          {/* KPI 2 · Prompt Coverage. Delta (pp) shows when a compare period is on. */}
          <KpiCard
            label="Prompt Coverage"
            hint="Tracked prompts citing owned domains"
            value={
              promptCoveragePct !== null ? `${promptCoveragePct}%`
                : 'None'
            }
            live={promptCoveragePct !== null}
            delta={
              promptCoveragePriorAvailable && promptCoveragePctDelta !== null ? promptCoveragePctDelta
                : undefined
            }
            deltaMode="pp"
          />
          {/* KPI 3 · AI Referral Traffic */}
          <KpiCard
            label="AI Referral Traffic"
            hint={`GA4 sessions from AI sources${models ? ' · across all AI engines' : ''}`}
            value={
              aiReferralTraffic !== null ? aiReferralTraffic.toLocaleString()
                : 'None'
            }
            live={aiReferralTraffic !== null}
            delta={
              aiPriorAvailable && aiReferralTrafficDelta !== null ? aiReferralTrafficDelta
                : undefined
            }
          />
          {/* KPI 4 · Organic Traffic */}
          <KpiCard
            label="Organic Traffic"
            hint="GA4 Organic Search channel sessions"
            value={
              organicTraffic !== null ? organicTraffic.toLocaleString()
                : 'None'
            }
            live={organicTraffic !== null}
            delta={
              organicPriorAvailable && organicTrafficDelta !== null ? organicTrafficDelta
                : undefined
            }
          />
        </div>
      </div>

      {/* ── Content performance: merged Avenue Z / all-cited table (replaces §B + §F) ── */}
      <ContentPerformanceTable
        rows={contentPerformanceRows}
        ga4Connected={!!ga4Rows}
        calendarConnected={!!calendarData}
      />

      {/* ── Section C: Time to first search / AI-referred visit ─────────────────── */}
      <SectionCard
        title="How quickly does new content get found?"
        description="For new content: days from publish date to the first visit by a person arriving from search, and from an AI answer (ChatGPT, Perplexity, Gemini…). Crawler visits don't count. Measured from publish date to today, whatever range is selected."
      >
        <TimeToFirstCards medFirstSearch={medFirstSearch} medFirstAi={medFirstAi} fastestAi={fastestAi} slowestAi={slowestAi}
          fastestAiUrl={fastestAiUrl} slowestAiUrl={slowestAiUrl} />
        {!sectionCOk && (
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">
              {calendarData
                ? 'Connect GA4 to calculate days-to-first-visit per planned URL'
                : 'Requires content calendar publish dates + GA4 page-level first-session data'}
            </p>
          </div>
        )}
      </SectionCard>

      {/* ── Section D: Bot vs Human scatter (FB-037) ───────────────────────── */}
      <SectionCard
        chart
        title="AI crawler visits vs. human visits, by page"
        description="See which pages are being crawled most by AI systems and how that compares with the human traffic those pages generate. Peec only retains the last 30 days of bot crawl data. When your selected date range is within the last 30 days, this chart follows it. Otherwise it shows the last 30 days."
      >
        <BotVsHumanScatter data={scatterData} clientDomain={ownedDomainNames[0] ?? ''} />
      </SectionCard>

      {/* ── Section E: Ranked slope chart (FB-038) ─────────────────────────── */}
      <SectionCard
        chart
        title="Which pages are gaining or losing momentum?"
      >
        <SlopeChart input={slopeInput} compareActive={slopeCompareActive} />
      </SectionCard>

      {promptGaps && (
        <PromptGapsBlock
          result={promptGaps}
          audience={audience}
          clientVisible={gapsClientVisible}
          canToggle={canToggleGaps}
          clientSlug={clientSlug}
        />
      )}

      {/* ── Section H: Competitor Analysis (PRD: 2 sub-views) ── */}
      <SectionCard
        title="Competitor Analysis"
        description="See which competitor domains are gaining or losing ground across Source Visibility, Citation Share, and Prompt Coverage for your target prompts."
      >
        {/* Sub-view 1: Top Competitor Domains - Source Visibility / Citation Share / Prompt Coverage */}
        {(() => {
          // FB-051: Citation Share = (domain.citationCount / sumOfAllCompetitorCitationCounts) * 100.
          // Mirrors §B and §H.2 share-of-period math. Replaces the broken
          // d.citationRate path that produced 199.9% values (citation_rate is
          // an avg count, not a fraction).
          //
          // FB-058: Citation Share delta is now computed truthfully. Each competitor
          // domain carries priorCitationCount (from buildTopDomains' priorData), so we
          // build a prior-period competitor denominator the same way as the current one
          // and take currentShare - priorShare. Both periods use the competitor-only
          // denominator so the math is consistent. Gated on compareIso, like every other
          // delta. A competitor with zero prior citations yields priorShare 0, so its
          // delta is the full current share (a clean period-over-period gain).
          // FB-063: when a model filter is active, prior-period values used
          // by these deltas are stale. filterDomainRowsByModel only rewrites
          // citationCount for the current period; priorCitationCount stays
          // populated from all-model prior data (see by-model.ts:25-27).
          // d.retrievedDelta and the per-domain prior coverage are likewise
          // computed without model scoping. Mixing model-filtered current
          // with all-model prior produces nonsense deltas (live audit:
          // nogood.io showed ↑48.7 pp Citation Share Δ under ChatGPT-only).
          // Fix: when models is set, render every Δ as -- (null) so the
          // numbers shown are at least internally consistent.
          const modelFilterActive = models != null && models.length > 0
          const totalCompetitorCitations = filteredCompetitorDomains
            .reduce((s, d) => s + (d.citationCount ?? 0), 0)
          const totalCompetitorCitationsPrior = filteredCompetitorDomains
            .reduce((s, d) => s + (d.priorCitationCount ?? 0), 0)
          const h1Rows: CompetitorDomainsCitedRow[] = filteredCompetitorDomains.slice(0, 25).map((d) => {
            const promptCovCurrent = getPromptCoverage(d.domain)
            const promptCovPrior   = compareIso && !modelFilterActive ? getPromptCoveragePrior(d.domain) : null
            const promptCovDelta   = compareIso && !modelFilterActive && promptCovCurrent !== null && promptCovPrior !== null
              ? promptCovCurrent - promptCovPrior
              : null
            const citationShareValue = totalCompetitorCitations > 0
              ? (d.citationCount / totalCompetitorCitations) * 100
              : 0
            const citationSharePrior = compareIso && !modelFilterActive && totalCompetitorCitationsPrior > 0
              ? (d.priorCitationCount / totalCompetitorCitationsPrior) * 100
              : null
            const citationShareDelta = compareIso && !modelFilterActive && citationSharePrior !== null
              ? citationShareValue - citationSharePrior
              : null
            return {
              domain: d.domain,
              aiVisibility:        d.retrieved,
              aiVisibilityDelta:   compareIso && !modelFilterActive ? d.retrievedDelta : null,
              citationShare:       citationShareValue,
              citationShareDelta:  citationShareDelta,
              promptCoverage:      promptCovCurrent,
              promptCoverageDelta: promptCovDelta,
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

        {/* Sub-view 2: Brand-Absent Competitor URLs */}
        {(() => {
          // Live source only. Citation Share math mirrors §B
          // Watched Pages: (urlCitationCount / periodTotalCitations) * 100,
          // delta = current pp - prior pp, gated on compareIso !== null AND
          // the row appearing in citeByKeyPrior with a non-zero prior total.
          const competitorCitedUrls = urlCitations
            .filter((c) => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)
            .sort((a, b) => b.citationCount - a.citationCount)
            .slice(0, 10)

          const h2Rows: CompetitorUrlsBrandAbsentRow[] = competitorCitedUrls.map((c) => {
            const cite = c.citationCount
            const citePrior = citeByKeyPrior.get(c.urlKey)?.citationCount ?? null
            const citationShare = (citationsOk && totalCitationsCurrentRows > 0)
              ? (cite / totalCitationsCurrentRows) * 100
              : null
            const citationSharePrior = (compareIso && citePrior !== null && totalCitationsPriorRows > 0)
              ? (citePrior / totalCitationsPriorRows) * 100
              : null
            const citationShareDelta = (citationShare !== null && citationSharePrior !== null)
              ? citationShare - citationSharePrior
              : null
            return {
              domain: c.domain,
              articleTitle: c.title,
              url: c.url,
              citationShare,
              citationShareDelta,
              competitorsMentioned: c.competitorBrandNames.join(', ') || null,
            }
          })

          return (
            <div className="flex flex-col gap-3">
              <CompetitorUrlsBrandAbsentTable
                rows={h2Rows}
                emptyMessage="No competitor citation data available from Peec AI"
              />
            </div>
          )
        })()}

      </SectionCard>

    </div>
  )
}
