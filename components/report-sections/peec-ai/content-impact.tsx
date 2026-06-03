import { FileText, Sparkles, Clock, TrendingUp, TrendingDown, Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPeecOverview } from '@/lib/peec/client'
import type { TopDomain } from '@/lib/peec/client'
import { getAgentAnalytics } from '@/lib/peec/agent-analytics'
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'
import { getContentCalendarData } from '@/lib/content-calendar/client'
import type { ContentCalendarData, ContentCalendarRow, MatchStatus } from '@/lib/content-calendar/types'
import { sampleContentCalendarData } from '@/lib/demo-data/content-calendar'
import { SAMPLE_GA4_CONTENT_IMPACT_ROWS } from '@/lib/demo-data/ga4-content-impact'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query } from '@/lib/ga4/client'

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

function EmptyBody({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

// ─── Status badge helpers ──────────────────────────────────────────────────────

const MATCH_STATUS_COLORS: Record<MatchStatus, string> = {
  matched:     'bg-[#60FF80]/10 text-[#60FF80]',
  unmatched:   'bg-white/[0.06] text-white/40',
  redirected:  'bg-[#FFFC60]/10 text-[#FFFC60]',
  unpublished: 'bg-[#FF4444]/10 text-[#FF4444]',
  unknown:     'bg-white/[0.06] text-white/30',
}

const ACTION_COLORS: Record<string, string> = {
  new:       'bg-[#60FF80]/10 text-[#60FF80]',
  optimized: 'bg-[#39A0FF]/10 text-[#39A0FF]',
  other:     'bg-white/[0.06] text-white/40',
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

export async function ContentImpactReport({ clientSlug, demoMode = false }: { clientSlug: string; demoMode?: boolean }) {
  const [peecResult, agentResult, calendarResult, ga4Result] = await Promise.allSettled([
    getPeecOverview(clientSlug),        // multi-client: uses peecCustomerProjectId from config
    getAgentAnalytics(clientSlug),
    getContentCalendarData(clientSlug), // null when contentCalendarSheetId not configured
    ga4Query({                          // page-level sessions for Section B -- requires ga4PropertyId
      clientSlug,
      dateRange: 'last_30_days',
      metrics: ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'],
      dimensions: ['pagePath'],
      limit: 1000,
    }),
  ])

  const peecData     = peecResult.status     === 'fulfilled' ? peecResult.value     : null
  const agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null
  let   calendarData = calendarResult.status === 'fulfilled' ? calendarResult.value : null
  let   ga4Rows      = ga4Result.status      === 'fulfilled' ? ga4Result.value.rows : null

  // Demo mode: when the calendar fetch returned null (client has no
  // contentCalendarSheetId) or errored, substitute realistic sample data.
  // We also substitute the GA4 page rows with matching sample data so
  // the per-row Sessions/Users/Views/Engagement Rate columns in
  // Section B (and the downstream aggregates in C/D) populate instead
  // of joining sample URLs against real GA4 and finding nothing.
  const calendarIsDemo = demoMode && (!calendarData || calendarData.rows.length === 0)
  if (calendarIsDemo) {
    calendarData = sampleContentCalendarData()
    ga4Rows = SAMPLE_GA4_CONTENT_IMPACT_ROWS
  }

  if (peecResult.status     === 'rejected') console.error('[content-impact] Peec error:', peecResult.reason)
  if (agentResult.status    === 'rejected') console.error('[content-impact] Agent analytics error:', agentResult.reason)
  if (calendarResult.status === 'rejected') console.error('[content-impact] Content calendar error:', calendarResult.reason)
  if (ga4Result.status      === 'rejected') console.error('[content-impact] GA4 error:', ga4Result.reason)

  // ── Derived metrics ────────────────────────────────────────────────────────
  const ownDomains        = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Own')
  const competitorDomains = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Competitor')
  const editorialDomains  = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Editorial')
  const totalCitations    = peecData?.totalCitationsByRange['YTD'] ?? 0

  const bots          = agentData?.bots ?? []
  const totalBotVisits = agentData?.totalBotVisits ?? 0

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

  // Prompt coverage and theme coverage per domain (PRD Section H)
  const domainPromptCount = new Map<string, number>()
  const domainThemes = new Map<string, Set<string>>()
  const totalTrackedPrompts = peecData?.trackedPrompts.length ?? 0
  for (const prompt of (peecData?.trackedPrompts ?? [])) {
    const group = (prompt.group as string | undefined) ?? 'General'
    for (const source of (prompt.sources as string[])) {
      const key = source.toLowerCase()
      domainPromptCount.set(key, (domainPromptCount.get(key) ?? 0) + 1)
      if (!domainThemes.has(key)) domainThemes.set(key, new Set())
      domainThemes.get(key)!.add(group)
    }
  }
  const getPromptCoverage = (domain: string): number | null =>
    totalTrackedPrompts > 0
      ? Math.round((domainPromptCount.get(domain.toLowerCase()) ?? 0) / totalTrackedPrompts * 100)
      : null
  const getThemeCoverage = (domain: string): number =>
    domainThemes.get(domain.toLowerCase())?.size ?? 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
          <FileText className="h-5 w-5 text-[#60FF80]" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">Content Impact Tracker</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Which content assets earn LLM citations, where content investments translate into AI visibility, and what the content team should build next.
          </p>
        </div>
      </div>

      {calendarIsDemo && (
        <div><SampleDataBadge note="content calendar not yet configured for this client" /></div>
      )}

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────────────────────── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">A. Content Impact Snapshot</h3>
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
          <KpiCard
            label="Total Sessions"
            hint={calendarIsDemo ? 'Sample · last 30d' : 'GA4 page-level required'}
            value={calendarIsDemo ? '9,910' : '--'}
            live={calendarIsDemo}
          />
          <KpiCard
            label="AI Citations"
            hint="Peec AI, owned domains YTD"
            value={totalCitations > 0 ? totalCitations.toLocaleString() : '--'}
            live={totalCitations > 0}
          />
          <KpiCard
            label="AI-Referred Sessions"
            hint={calendarIsDemo ? 'Sample · last 30d' : 'GA4 AI-source sessions required'}
            value={calendarIsDemo ? '1,243' : '--'}
            live={calendarIsDemo}
          />
          <KpiCard
            label="Owned URLs with AI Activity"
            hint="Bot-crawled pages (30d)"
            value={agentData ? `${agentData.uniquePagesVisited} pages` : '--'}
            live={!!agentData && agentData.uniquePagesVisited > 0}
          />
          <KpiCard
            label="% Null / Unmatched"
            hint="Planned content with no data"
            value={unmatchedPct !== null ? `${unmatchedPct}%` : '--'}
            live={unmatchedPct !== null}
          />
          <KpiCard
            label="Owned Domains Cited in AI"
            hint="Peec AI brand-owned domains with citations"
            value={ownDomains.length > 0 ? ownDomains.length.toLocaleString() : '--'}
            live={ownDomains.length > 0}
          />
        </div>
      </div>

      {/* ── Section B: Planned Content Performance Table (PRD: 16 columns) ── */}
      <SectionCard
        title="B. Planned Content Performance"
        description="Each content-calendar URL tracked against AI citations and bot activity. Connect GA4 for sessions, users, views, and engagement rate."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Topic</Th>
                <Th>URL</Th>
                <Th>Content Type</Th>
                <Th>Status</Th>
                <Th>Content Action</Th>
                <Th>Publish Date</Th>
                <Th>Update Date</Th>
                <Th>Sessions</Th>
                <Th>Users</Th>
                <Th>Views</Th>
                <Th>Engagement Rate</Th>
                <Th>AI Citations</Th>
                <Th>AI Bot Activity</Th>
                <Th>AI-Referred Sessions</Th>
                <Th>Match Status</Th>
                <Th>Recommended Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {enrichedRows.length > 0 ? (
                enrichedRows.slice(0, 50).map((row, i) => {
                  const hasBotVisits = (row.aiBotVisits ?? 0) > 0
                  return (
                    <tr key={`${row.url ?? row.topic}-${i}`}>
                      <Td>
                        <span className="font-medium text-white max-w-[160px] block truncate" title={row.topic}>
                          {row.topic}
                        </span>
                      </Td>
                      <Td>
                        {row.url ? (
                          <span className="font-mono text-[10px] text-white/50 max-w-[180px] block truncate" title={row.url}>
                            {row.url}
                          </span>
                        ) : (
                          <span className="text-white/20">--</span>
                        )}
                      </Td>
                      <Td><span className="text-white/60">{row.contentType}</span></Td>
                      <Td><span className="text-white/60">{row.status}</span></Td>
                      <Td>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                          ACTION_COLORS[row.contentAction]
                        )}>
                          {row.contentAction}
                        </span>
                      </Td>
                      <Td><span className="text-white/40 text-[10px]">{row.publishDate ?? '--'}</span></Td>
                      <Td><span className="text-white/40 text-[10px]">{row.updateDate ?? '--'}</span></Td>
                      {/* GA4 columns -- live when service account has GA4 access */}
                      {(() => {
                        const g = getGA4Metrics(row.url, ga4Rows)
                        return (
                          <>
                            <Td>
                              {g.sessions !== null
                                ? <span className="tabular-nums text-white">{g.sessions.toLocaleString()}</span>
                                : <span className="text-white/20">--</span>}
                            </Td>
                            <Td>
                              {g.users !== null
                                ? <span className="tabular-nums text-white/70">{g.users.toLocaleString()}</span>
                                : <span className="text-white/20">--</span>}
                            </Td>
                            <Td>
                              {g.views !== null
                                ? <span className="tabular-nums text-white/70">{g.views.toLocaleString()}</span>
                                : <span className="text-white/20">--</span>}
                            </Td>
                            <Td>
                              {g.engagementRate !== null
                                ? <span className="tabular-nums text-white/70">{(g.engagementRate * 100).toFixed(1)}%</span>
                                : <span className="text-white/20">--</span>}
                            </Td>
                          </>
                        )
                      })()}
                      {/* AI data -- live when Peec URL-level data available */}
                      <Td>
                        {calendarIsDemo
                          ? <span className="tabular-nums text-white">{[12, 8, 5, 14, 3, 18, 7, 0, 9, 22, 4, 11, 6][i % 13]}</span>
                          : <span className="text-white/20">--</span>}
                      </Td>
                      <Td>
                        {hasBotVisits ? (
                          <span className="tabular-nums text-[#60FDFF]">{row.aiBotVisits}</span>
                        ) : (
                          <span className="text-white/20">0</span>
                        )}
                      </Td>
                      <Td>
                        {calendarIsDemo
                          ? <span className="tabular-nums text-white">{[238, 152, 87, 412, 64, 524, 109, 31, 196, 671, 78, 245, 134][i % 13].toLocaleString()}</span>
                          : <span className="text-white/20">--</span>}
                      </Td>
                      <Td>
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                          MATCH_STATUS_COLORS[row.matchStatus]
                        )}>
                          {row.matchStatus}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11px] text-white/50 max-w-[200px] block">
                          {deriveAction(row, hasBotVisits)}
                        </span>
                      </Td>
                    </tr>
                  )
                })
              ) : calendarData ? (
                <EmptyBody cols={16} message="Content calendar loaded but no rows found -- check sheet format and column headers" />
              ) : (
                <EmptyBody cols={16} message="Connect content calendar (Google Sheet) + GA4 page-level data to populate" />
              )}
            </tbody>
          </table>
        </div>
        {enrichedRows.length > 50 && (
          <p className="text-[10px] text-text-muted">Showing 50 of {enrichedRows.length} planned content rows.</p>
        )}
        {ga4Rows && (
          <p className="text-[10px] text-text-muted">
            Sessions, Users, Views, and Engagement Rate: GA4 page-level data (last 30d). Rows without a match show --.
          </p>
        )}
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Match Status Definitions</p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(MATCH_STATUS_COLORS) as [MatchStatus, string][]).map(([status, cls]) => (
              <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>{status}</span>
            ))}
          </div>
          <p className="text-[10px] text-text-muted">
            Content Action: <span className="text-white/40">New</span> = net-new publish,{' '}
            <span className="text-white/40">Optimized</span> = existing page refreshed or rewritten,{' '}
            <span className="text-white/40">Other</span> = unclassified
          </p>
        </div>
      </SectionCard>

      {/* ── Section C: Time to First Traffic / AI Activity ─────────────────── */}
      <SectionCard
        title="C. Time to First Traffic and First AI Activity"
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
        title="D. Net-New vs Optimized Content Lift"
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
        title="E. Decay vs Compounding Content"
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
      <SectionCard
        title="F. Owned Content Cited in AI"
        description="Your owned domains and URLs that appear in AI-generated responses. Ranked by citation frequency."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL / Domain</Th>
                <Th>Topic</Th>
                <Th>Prompt Cluster</Th>
                <Th>AI Citation Count</Th>
                <Th>AI Engines Citing</Th>
                <Th>Average Position</Th>
                <Th>AI-Referred Sessions</Th>
                <Th>Post-Launch AI Lift</Th>
                <Th>Recommended Action</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {ownDomains.length > 0 ? (
                ownDomains.map((d, i) => {
                  const demoTopics  = ['AEO Strategy',           'AI Marketing Trends',  'Brand Visibility',     'Content Performance', 'Citation Patterns']
                  const demoClusters = ['Discovery',              'Comparison',           'How-to',               'Research',            'Brand Authority']
                  const demoEngines  = ['ChatGPT, Claude',        'ChatGPT, Perplexity',  'Claude, Gemini',       'ChatGPT, Copilot',    'Perplexity, Claude']
                  const demoPositions = [1.8, 2.3, 1.5, 2.7, 2.1]
                  const demoAiSessions = [284, 197, 412, 156, 203]
                  return (
                    <tr key={d.domain}>
                      <Td><span className="font-medium text-white">{d.domain}</span></Td>
                      <Td>{calendarIsDemo ? <span className="text-white/70">{demoTopics[i % demoTopics.length]}</span> : <span className="text-white/40">--</span>}</Td>
                      <Td>{calendarIsDemo ? <span className="text-white/70">{demoClusters[i % demoClusters.length]}</span> : <span className="text-white/40">--</span>}</Td>
                      <Td><span className="tabular-nums text-white">{d.citationRate > 0 ? d.citationRate.toFixed(1) + '%' : '--'}</span></Td>
                      <Td>{calendarIsDemo ? <span className="text-white/70">{demoEngines[i % demoEngines.length]}</span> : <span className="text-white/40">--</span>}</Td>
                      <Td>{calendarIsDemo ? <span className="tabular-nums text-white">#{demoPositions[i % demoPositions.length]}</span> : <span className="text-white/40">--</span>}</Td>
                      <Td>{calendarIsDemo ? <span className="tabular-nums text-white">{demoAiSessions[i % demoAiSessions.length]}</span> : <span className="text-white/40">--</span>}</Td>
                      <Td>
                        {d.retrievedDelta !== 0 ? (
                          <span className={cn('text-xs font-semibold tabular-nums', d.retrievedDelta > 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
                            {d.retrievedDelta > 0 ? '+' : ''}{d.retrievedDelta.toFixed(1)}%
                          </span>
                        ) : <span className="text-white/40">--</span>}
                      </Td>
                      <Td><span className="text-[11px] text-white/50">Monitor and protect citation position</span></Td>
                    </tr>
                  )
                })
              ) : (
                <EmptyBody cols={9} message="No owned-domain citation data available from Peec AI" />
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section G: Content Gaps (PRD: 3 sub-views) ────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <div>
          <h3 className="text-sm font-bold text-white">G. Content Gaps and Disconnects</h3>
          <p className="mt-1 text-xs text-text-muted">
            Three views of content gap: pages with traffic but no AI citations, AI-cited pages without human traffic, and bot-crawled pages without citations or visits.
          </p>
        </div>

        {/* Sub-view 1: Traffic but No AI Citations */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#39A0FF]/10 text-[10px] font-bold text-[#39A0FF]">1</span>
            <span className="text-xs font-bold text-white/70">Traffic but No AI Citations</span>
          </div>
          <p className="text-[11px] text-text-muted">High-traffic owned pages not cited by any AI tool. Priority AEO optimization candidates.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL</Th>
                  <Th>Topic</Th>
                  <Th>Sessions</Th>
                  <Th>AI Citations</Th>
                  <Th>Opportunity Note</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {calendarIsDemo ? (
                  [
                    { url: '/services',                          topic: 'Services Overview',       sessions: 827,  cites: 0, note: 'Add structured data + brand authority signals to surface in agency-comparison queries' },
                    { url: '/about',                             topic: 'About Avenue Z',          sessions: 1042, cites: 0, note: 'Add founder story + clear capability statement for "who is Avenue Z" type prompts' },
                    { url: '/blog/audit-brand-chatgpt',          topic: 'How to Audit Brand',      sessions: 447,  cites: 0, note: 'Already strong page — needs interlinking from AEO pillar to compound citation signal' },
                    { url: '/pricing',                           topic: 'Pricing',                 sessions: 274,  cites: 0, note: 'Add ROI calculator + comparison framing for "agency pricing" prompts' },
                  ].map(r => (
                    <tr key={r.url}>
                      <Td><span className="font-mono text-[10px] text-white/70">{r.url}</span></Td>
                      <Td><span className="text-white/70">{r.topic}</span></Td>
                      <Td><span className="tabular-nums text-white">{r.sessions.toLocaleString()}</span></Td>
                      <Td><span className="tabular-nums text-white/40">{r.cites}</span></Td>
                      <Td><span className="text-[11px] text-white/60">{r.note}</span></Td>
                    </tr>
                  ))
                ) : (
                  <EmptyBody cols={5} message="Requires GA4 page sessions + Peec AI owned-domain URL-level data" />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: AI Citations but Little Human Traffic */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#60FF80]/10 text-[10px] font-bold text-[#60FF80]">2</span>
            <span className="text-xs font-bold text-white/70">AI Citations but Little Human Traffic</span>
          </div>
          <p className="text-[11px] text-text-muted">Pages AI tools cite frequently but with low GA4 sessions. Indicates CTA or UX conversion gap.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL</Th>
                  <Th>Topic</Th>
                  <Th>AI Citations</Th>
                  <Th>Sessions</Th>
                  <Th>Opportunity Note</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {calendarIsDemo ? (
                  [
                    { url: '/methodology/brand-authority',        topic: 'Brand Authority',         cites: 18, sessions: 524, note: 'Highly cited but low human traffic — add prominent CTA to drive trial sign-ups' },
                    { url: '/press/techcrunch-feature',           topic: 'Press: TechCrunch',       cites:  9, sessions: 213, note: 'Press coverage drives AI citation but doesn\'t convert — add follow-up content path' },
                    { url: '/case-studies/renaissance-benefits',  topic: 'Renaissance Case Study',  cites: 14, sessions: 392, note: 'Industry credibility piece — link from services page to convert authority into demos' },
                    { url: '/resources/geo-glossary',             topic: 'GEO Glossary',            cites: 36, sessions: 983, note: 'Strong organic citation — embed in-context CTAs without disrupting reference utility' },
                  ].map(r => (
                    <tr key={r.url}>
                      <Td><span className="font-mono text-[10px] text-white/70">{r.url}</span></Td>
                      <Td><span className="text-white/70">{r.topic}</span></Td>
                      <Td><span className="tabular-nums text-white">{r.cites}</span></Td>
                      <Td><span className="tabular-nums text-white">{r.sessions.toLocaleString()}</span></Td>
                      <Td><span className="text-[11px] text-white/60">{r.note}</span></Td>
                    </tr>
                  ))
                ) : (
                  <EmptyBody cols={5} message="Requires GA4 + Peec AI URL-level citation data" />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: AI Bot Attention but No Citations/Visits (LIVE from agent-analytics) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#FFFC60]/10 text-[10px] font-bold text-[#FFFC60]">3</span>
            <span className="text-xs font-bold text-white/70">AI Bot Attention but No Citations or Human Visits</span>
          </div>
          <p className="text-[11px] text-text-muted">Pages AI crawlers visit but don't cite. Signals content quality or format issues preventing LLM extraction.</p>
          {agentData && agentData.topPaths.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>URL Path</Th>
                    <Th>Topic (Calendar)</Th>
                    <Th>AI Bot Visits</Th>
                    <Th>AI Citations</Th>
                    <Th>AI-Referred Sessions</Th>
                    <Th>Opportunity Note</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {agentData.topPaths.slice(0, 10).map(p => {
                    // Try to match this path to a content calendar row
                    const calMatch = enrichedRows.find(r => {
                      const rPath = extractPath(r.url)
                      return rPath && (rPath === p.path || rPath === p.path.replace(/\/$/, ''))
                    })
                    return (
                      <tr key={p.path}>
                        <Td><span className="font-mono text-[10px] text-white/60">{p.path}</span></Td>
                        <Td><span className="text-white/50">{calMatch?.topic ?? '--'}</span></Td>
                        <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
                        <Td><span className="text-white/40">--</span></Td>
                        <Td><span className="text-white/20">--</span></Td>
                        <Td>
                          <span className="text-[11px] text-white/50">
                            {p.status >= 400 ? 'Error page -- fix or redirect'
                              : p.status >= 300 ? 'Redirect -- verify final destination'
                              : 'Crawled but not cited -- check content format for LLM extraction'}
                          </span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>URL</Th>
                    <Th>Topic</Th>
                    <Th>AI Bot Visits</Th>
                    <Th>AI Citations</Th>
                    <Th>AI-Referred Sessions</Th>
                    <Th>Opportunity Note</Th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyBody cols={6} message="No AI bot crawl data available -- check PEEC_AI_CUSTOMER_TOKEN configuration." />
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Section H: Competitor / Third-Party Content (PRD: 3 sub-views) ── */}
      <SectionCard
        title="H. Competitor and Third-Party Content Cited for Your Prompts"
        description="Non-owned content that AI tools cite for your tracked prompts. Understanding what wins informs what to create or pitch."
      >
        {/* Sub-view 1: Top Competitor Domains */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-white/60">Top Competitor / Corporate Domains Cited in AI</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Domain</Th>
                  <Th>Citation Count</Th>
                  <Th>Prompt Coverage %</Th>
                  <Th>Theme Coverage</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {competitorDomains.length > 0 ? (
                  competitorDomains.slice(0, 10).map(d => {
                    const maxRetrieved = Math.max(...competitorDomains.slice(0, 10).map(x => x.retrieved), 1)
                    const barWidth = (d.retrieved / maxRetrieved) * 100
                    const promptCov = getPromptCoverage(d.domain)
                    const themeCov  = getThemeCoverage(d.domain)
                    return (
                      <tr key={d.domain}>
                        <Td>
                          <span className="block max-w-[150px] truncate font-medium text-white/80" title={d.domain}>{d.domain}</span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
                              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="tabular-nums text-white/60">{d.citationRate.toFixed(1)}%</span>
                          </div>
                        </Td>
                        <Td>
                          <span className="tabular-nums text-white">
                            {promptCov !== null ? `${promptCov}%` : '--'}
                          </span>
                        </Td>
                        <Td>
                          <span className="tabular-nums text-white/60">
                            {themeCov > 0 ? `${themeCov} theme${themeCov !== 1 ? 's' : ''}` : '--'}
                          </span>
                        </Td>
                      </tr>
                    )
                  })
                ) : (
                  <EmptyBody cols={4} message="No competitor domain data available from Peec AI" />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: Brand-Absent Editorial URLs */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-white/60">Top Competitor / Corporate URLs Where Brand is Absent</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Domain</Th>
                  <Th>Article Title</Th>
                  <Th>URL</Th>
                  <Th>Prompt Cluster</Th>
                  <Th>Citation Count</Th>
                  <Th>Competitors Mentioned</Th>
                  <Th>Brand Mentioned</Th>
                  <Th>Opportunity Priority</Th>
                  <Th>Suggested PR Angle</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {editorialDomains.length > 0 ? (
                  editorialDomains.slice(0, 10).map((d, i) => {
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
                    const title = calendarIsDemo ? demoArticleTitles2[i % demoArticleTitles2.length] : null
                    const slug  = calendarIsDemo ? demoSlugs2[i % demoSlugs2.length] : null
                    const url   = slug ? `https://${d.domain}${slug}` : null
                    const cluster = calendarIsDemo ? demoClusters2[i % demoClusters2.length] : null
                    const comps   = calendarIsDemo ? demoCompetitorsAbsent[i % demoCompetitorsAbsent.length] : null
                    const brand   = calendarIsDemo ? demoBrandMentioned[i % demoBrandMentioned.length] : null
                    return (
                      <tr key={d.domain}>
                        <Td><span className="font-medium text-white">{d.domain}</span></Td>
                        <Td>
                          {title
                            ? <span className="text-white/70 max-w-[180px] block truncate" title={title}>{title}</span>
                            : <span className="text-white/20">--</span>}
                        </Td>
                        <Td>
                          {url
                            ? <span className="font-mono text-[10px] text-white/50 max-w-[180px] block truncate" title={url}>{url}</span>
                            : <span className="text-white/20">--</span>}
                        </Td>
                        <Td>
                          {cluster
                            ? <span className="text-white/60">{cluster}</span>
                            : <span className="text-white/40">--</span>}
                        </Td>
                        <Td><span className="tabular-nums text-white">{d.citationRate.toFixed(1)}%</span></Td>
                        <Td>
                          {comps
                            ? <span className="text-white/70">{comps.join(', ')}</span>
                            : <span className="text-white/20">--</span>}
                        </Td>
                        <Td>
                          {brand
                            ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', brand === 'No' ? 'bg-[#FF4444]/10 text-[#FF4444]' : 'bg-[#60FF80]/10 text-[#60FF80]')}>{brand}</span>
                            : <span className="text-white/40">--</span>}
                        </Td>
                        <Td>
                          <span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">
                            Review
                          </span>
                        </Td>
                        <Td>
                          <span className="block max-w-[200px] text-[11px] text-white/50">
                            Secure coverage on {d.domain} to displace competitor citations
                          </span>
                        </Td>
                      </tr>
                    )
                  })
                ) : (
                  <EmptyBody cols={9} message="No editorial domain data from Peec AI" />
                )}
              </tbody>
            </table>
          </div>
          {!calendarIsDemo && (
            <p className="text-[10px] text-text-muted">
              Article Title, URL, and Competitors Mentioned require URL-level citation data from Peec AI (currently domain-level only).
            </p>
          )}
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: Repeated Competitor Pages Across Themes */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-white/60">Repeated Competitor Pages Across Target Themes</h4>
          <p className="text-xs text-text-muted">
            Specific competitor pages cited across multiple prompt clusters. These are the pages your content needs to outperform.
          </p>
          {calendarIsDemo ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>Competitor URL</Th>
                    <Th>Competitor</Th>
                    <Th>Prompt Clusters Cited In</Th>
                    <Th>Total Citations</Th>
                    <Th>Avg Position</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {[
                    { url: 'ogilvy.com/insights/brand-authority-in-llms',     competitor: 'Ogilvy',           clusters: ['Brand authority', 'Reputation / trust', 'Industry expertise'], citations: 24, avgPos: 2.1 },
                    { url: 'edelman.com/research/trust-barometer-2026',       competitor: 'Edelman',          clusters: ['Reputation / trust', 'Buying-stage research'],                 citations: 19, avgPos: 2.4 },
                    { url: 'webershandwick.com/work/ai-pr-case-studies',      competitor: 'Weber Shandwick',  clusters: ['Industry expertise', 'Competitive comparison'],                citations: 17, avgPos: 3.0 },
                    { url: 'bcw-global.com/expertise/aeo-services',           competitor: 'BCW',              clusters: ['Brand authority', 'Buying-stage research'],                    citations: 14, avgPos: 3.3 },
                    { url: 'fleishmanhillard.com/2026/ai-search-report',      competitor: 'FleishmanHillard', clusters: ['Industry expertise', 'Reputation / trust', 'Brand authority'], citations: 13, avgPos: 2.7 },
                    { url: 'mslgroup.com/insights/generative-pr',             competitor: 'MSL',              clusters: ['Industry expertise', 'Competitive comparison'],                citations: 11, avgPos: 3.5 },
                  ].map(row => (
                    <tr key={row.url}>
                      <Td>
                        <span className="font-mono text-[10px] text-white/70 max-w-[220px] block truncate" title={row.url}>
                          {row.url}
                        </span>
                      </Td>
                      <Td><span className="font-medium text-white/80">{row.competitor}</span></Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {row.clusters.map(c => (
                            <span key={c} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/60">{c}</span>
                          ))}
                        </div>
                      </Td>
                      <Td><span className="tabular-nums text-white">{row.citations}</span></Td>
                      <Td><span className="tabular-nums text-white">#{row.avgPos.toFixed(1)}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
              <p className="text-xs text-text-muted">Requires URL-level citation data from Peec AI Pro</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Section I: AI Systems Interacting with Our Content (LIVE) ─────── */}
      <SectionCard
        title="I. AI Systems Interacting with Our Content"
        description="Which AI crawlers are actively indexing owned content, their visit frequency, and which pages they target most."
      >
        {agentData && bots.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {bots.slice(0, 6).map((bot) => (
                <div key={bot.botId} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-center gap-1.5">
                    <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                    <span className="text-[11px] font-bold text-white/70">{bot.botName}</span>
                  </div>
                  <span className="text-lg font-bold text-white">{bot.totalVisits.toLocaleString()}</span>
                  <span className="text-[10px] text-text-muted">visits / 30d</span>
                  <span className="text-[10px] text-text-muted">{bot.uniquePages} pages crawled</span>
                  {bot.successRate !== null && (
                    <div className="mt-1 flex items-center gap-1">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className={cn('h-full rounded-full',
                            bot.successRate >= 0.8 ? 'bg-[#60FF80]'
                              : bot.successRate >= 0.4 ? 'bg-[#FFFC60]'
                              : 'bg-[#FF4444]'
                          )}
                          style={{ width: `${Math.round(bot.successRate * 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-white/30">{Math.round(bot.successRate * 100)}% 2xx</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>AI Platform / Bot</Th>
                    <Th>Bot Type</Th>
                    <Th>Total Visits (30d)</Th>
                    <Th>Unique Pages</Th>
                    <Th>2xx Success Rate</Th>
                    <Th>Last Seen</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {bots.map(bot => {
                    const typeLabel = bot.botType === 'training' ? 'Training'
                      : bot.botType === 'retrieval' ? 'Retrieval'
                      : bot.botType === 'search' ? 'Search'
                      : 'Agent'
                    return (
                      <tr key={bot.botId}>
                        <Td><span className="font-medium text-white">{bot.botName}</span></Td>
                        <Td>
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            bot.botType === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
                            bot.botType === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
                            bot.botType === 'search'    ? 'bg-[#60FF80]/10 text-[#60FF80]' :
                            'bg-white/[0.06] text-white/40'
                          )}>
                            {typeLabel}
                          </span>
                        </Td>
                        <Td><span className="tabular-nums text-white">{bot.totalVisits.toLocaleString()}</span></Td>
                        <Td><span className="tabular-nums text-white/60">{bot.uniquePages}</span></Td>
                        <Td>
                          {bot.successRate !== null ? (
                            <span className={cn('font-semibold tabular-nums',
                              bot.successRate >= 0.8 ? 'text-[#60FF80]' : bot.successRate >= 0.4 ? 'text-[#FFFC60]' : 'text-[#FF4444]'
                            )}>
                              {Math.round(bot.successRate * 100)}%
                            </span>
                          ) : <span className="text-white/20">--</span>}
                        </Td>
                        <Td><span className="font-mono text-[10px] text-white/30">{bot.lastSeen ?? '--'}</span></Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-text-muted">
              {totalBotVisits.toLocaleString()} total AI bot visits in the last 30 days across {bots.length} platforms.
            </p>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {['GPTBot', 'ClaudeBot', 'PerplexityBot', 'GoogleBot-AI', 'CCBot', 'Applebot'].map((bot) => (
              <div key={bot} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-[11px] font-bold text-white/50">{bot}</span>
                </div>
                <span className="text-sm font-bold text-white/20">--</span>
                <span className="text-[10px] text-text-muted">visits, pending</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Section J: Recommended Actions (PRD: 7-column data table) ─────── */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">J. What the Content Team Should Do Next</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL / Topic</Th>
                <Th>Issue / Opportunity</Th>
                <Th>Evidence Type</Th>
                <Th>Suggested Action</Th>
                <Th>Reason</Th>
                <Th>Priority</Th>
                <Th>Owner</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {/* Recommendation 1: Error pages visited by AI bots */}
              {agentData && agentData.errorPageHits > 0 && (
                <tr>
                  <Td><span className="font-medium text-white">Error pages (4xx/5xx)</span></Td>
                  <Td><span className="text-white/60">{agentData.errorPageHits} AI bot visits hitting errors</span></Td>
                  <Td><span className="text-white/50">AI Bot Data</span></Td>
                  <Td><span className="text-white/60">Fix or redirect error pages visited by AI bots</span></Td>
                  <Td><span className="text-white/50">Bots wasting crawl budget on dead pages</span></Td>
                  <Td><span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">High</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Dev</span></Td>
                </tr>
              )}
              {/* Recommendation 2: Redirect chains */}
              {agentData && agentData.redirectHits > 10 && (
                <tr>
                  <Td><span className="font-medium text-white">Redirect chains</span></Td>
                  <Td><span className="text-white/60">{agentData.redirectHits} AI bot visits hitting redirects</span></Td>
                  <Td><span className="text-white/50">AI Bot Data</span></Td>
                  <Td><span className="text-white/60">Consolidate redirect chains to direct canonical URLs</span></Td>
                  <Td><span className="text-white/50">AI bots may not follow all redirect hops</span></Td>
                  <Td><span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">Medium</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Dev</span></Td>
                </tr>
              )}
              {/* Recommendation 3: Unpublished planned content */}
              {calendarData && calendarData.rows.filter(r => r.matchStatus === 'unpublished').length > 0 && (
                <tr>
                  <Td><span className="font-medium text-white">Unpublished planned content</span></Td>
                  <Td><span className="text-white/60">
                    {calendarData.rows.filter(r => r.matchStatus === 'unpublished').length} calendar URLs not yet live
                  </span></Td>
                  <Td><span className="text-white/50">Content Calendar</span></Td>
                  <Td><span className="text-white/60">Prioritize publishing -- planned content generates zero AI visibility until live</span></Td>
                  <Td><span className="text-white/50">Unpublished content earns no citations or crawls</span></Td>
                  <Td><span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">High</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Content</span></Td>
                </tr>
              )}
              {/* Recommendation 4: Bot-crawled but zero citations */}
              {agentData && agentData.topPaths.length > 0 && ownDomains.length === 0 && (
                <tr>
                  <Td><span className="font-medium text-white">All crawled pages</span></Td>
                  <Td><span className="text-white/60">{agentData.uniquePagesVisited} pages crawled by AI with 0 citations</span></Td>
                  <Td><span className="text-white/50">AI Bot + Peec AI</span></Td>
                  <Td><span className="text-white/60">Add structured data (FAQ schema, Article schema) and direct answer blocks to key pages</span></Td>
                  <Td><span className="text-white/50">Structured content earns higher AI citation rates than unstructured pages</span></Td>
                  <Td><span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">Medium</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Content</span></Td>
                </tr>
              )}
              {/* Recommendation 5: Competitor-dominated clusters */}
              {competitorDomains.length > 0 && (
                <tr>
                  <Td><span className="font-medium text-white">Competitor-dominated clusters</span></Td>
                  <Td><span className="text-white/60">{competitorDomains.length} competitor domains cited in AI for your prompts</span></Td>
                  <Td><span className="text-white/50">Peec AI</span></Td>
                  <Td><span className="text-white/60">Create targeted content for each competitor-dominated prompt cluster</span></Td>
                  <Td><span className="text-white/50">Displace competitor citations with higher-quality owned content</span></Td>
                  <Td><span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">Medium</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Content</span></Td>
                </tr>
              )}
              {/* Fallback: no data */}
              {!agentData && !calendarData && ownDomains.length === 0 && competitorDomains.length === 0 && (
                <EmptyBody cols={7} message="Connect content calendar and GA4 to generate URL-level recommendations" />
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[10px] text-text-muted">
          Opportunity Score = 30% human performance potential + 25% AI citation gap + 20% competitor pressure + 15% AI bot attention + 10% content freshness
        </p>
      </div>

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
