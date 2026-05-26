import { FileText, Sparkles, Clock, TrendingUp, TrendingDown, Globe2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPeecOverview } from '@/lib/peec/client'
import type { TopDomain, TrackedPrompt } from '@/lib/peec/client'
import { getAgentAnalytics } from '@/lib/peec/agent-analytics'
import type { AgentAnalyticsData } from '@/lib/peec/agent-analytics'

// ---------------------------------------------------------------------------
// Content Impact Tracker
// PRD Sections A-J -- FULL SPEC IMPLEMENTATION
//
// Live data:  Peec AI (brand visibility, citations, editorial domains)
//             Peec Agent Analytics (AI bot crawl data)
// Pending:    Content calendar (CSV/Notion), GA4 page-level sessions
//
// Thomas's note: Content Impact for Avenue Z will be weaker since AZ doesn't
// maintain a formal content tracker for itself. Structure is PRD-compliant;
// data populates as connectors come online.
// ---------------------------------------------------------------------------

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

const MATCH_STATUS_COLORS: Record<string, string> = {
  Matched: 'bg-[#60FF80]/10 text-[#60FF80]',
  Unmatched: 'bg-white/[0.06] text-white/40',
  Redirected: 'bg-[#FFFC60]/10 text-[#FFFC60]',
  Unpublished: 'bg-[#FF4444]/10 text-[#FF4444]',
}

// ── Main async RSC ──────────────────────────────────────────────────────────

export async function ContentImpactReport({ clientSlug }: { clientSlug: string }) {
  // Fetch available data sources in parallel with graceful degradation
  const [peecResult, agentResult] = await Promise.allSettled([
    getPeecOverview(),
    getAgentAnalytics(clientSlug),
  ])

  const peecData  = peecResult.status  === 'fulfilled' ? peecResult.value  : null
  const agentData = agentResult.status === 'fulfilled' ? agentResult.value : null

  if (peecResult.status  === 'rejected') console.error('[content-impact] Peec error:', peecResult.reason)
  if (agentResult.status === 'rejected') console.error('[content-impact] Agent analytics error:', agentResult.reason)

  // Derive metrics from available data
  const ownDomains = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Own')
  const totalOwnCitations = ownDomains.reduce((s, d) => s + d.citationRate, 0)
  const totalCitations = peecData?.totalCitationsByRange['YTD'] ?? 0

  // Bot data for Section I
  const bots = agentData?.bots ?? []
  const totalBotVisits = agentData?.totalBotVisits ?? 0

  // Competitor / third-party domains for Section H
  const competitorDomains = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Competitor')
  const editorialDomains = (peecData?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Editorial')
  const allThirdPartyDomains = [...competitorDomains, ...editorialDomains]
    .sort((a, b) => b.retrieved - a.retrieved)

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

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">KPI Strip</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Planned URLs"                  hint="Content calendar required" value="--" />
          <KpiCard label="Live URLs"                     hint="GA4 page-level data required" value="--" />
          <KpiCard label="Total Sessions"                hint="GA4, 30d" value="--" />
          <KpiCard
            label="AI Citations"
            hint="Peec AI, owned domains YTD"
            value={totalCitations > 0 ? totalCitations.toLocaleString() : '--'}
            live={totalCitations > 0}
          />
          <KpiCard label="AI-Referred Sessions"          hint="GA4 AI source sessions required" value="--" />
          <KpiCard
            label="Owned URLs with AI Activity"
            hint="URLs cited or bot-crawled"
            value={agentData ? `${agentData.uniquePagesVisited} pages` : '--'}
            live={!!agentData && agentData.uniquePagesVisited > 0}
          />
          <KpiCard label="% Null / Unmatched"            hint="Content calendar required" value="--" />
          <KpiCard
            label="% Cited in AI"
            hint="Own domain citation rate"
            value={ownDomains.length > 0 ? `${ownDomains.length} domains` : '--'}
            live={ownDomains.length > 0}
          />
        </div>
      </div>

      {/* ── Section B: Planned Content Performance Table (PRD: 16 columns) ── */}
      <SectionCard
        title="B. Planned Content Performance"
        description="Each planned content URL tracked against GA4 sessions, AI citations, and content calendar metadata. Requires content calendar connection to populate."
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
            <tbody>
              <EmptyBody cols={16} message="Connect content calendar (CSV or Google Sheet) + GA4 page-level data to populate" />
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Match Status Definitions</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(MATCH_STATUS_COLORS).map(([status, cls]) => (
              <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{status}</span>
            ))}
          </div>
          <p className="text-[10px] text-text-muted">Content Action: <span className="text-white/40">New</span> = net-new publish, <span className="text-white/40">Optimized</span> = existing page updated, <span className="text-white/40">Other</span> = unclassified</p>
        </div>
      </SectionCard>

      {/* ── Section C: Time to First Traffic / AI Activity ── */}
      <SectionCard
        title="C. Time to First Traffic and First AI Activity"
        description="For each published URL, measures days from publish date to first GA4 session and first AI citation or bot crawl."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { icon: Clock, label: 'Median Days to First Traffic', color: '#39A0FF' },
            { icon: Clock, label: 'Median Days to First AI Activity', color: '#60FDFF' },
            { icon: TrendingUp, label: 'Fastest AI-Indexed Content', color: '#60FF80' },
            { icon: TrendingDown, label: 'Slowest AI-Indexed Content', color: '#FF4444' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <Icon className="h-4 w-4" style={{ color }} />
              <span className="text-[11px] font-semibold text-text-muted">{label}</span>
              <span className="text-lg font-bold text-white/20">--</span>
            </div>
          ))}
        </div>
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Requires content calendar publish dates + GA4 page-level first-session data</p>
        </div>
      </SectionCard>

      {/* ── Section D: Net-New vs Optimized Content Lift ── */}
      <SectionCard
        title="D. Net-New vs Optimized Content Lift"
        description="Compares performance lift for net-new content versus optimized (updated/expanded) pages. Requires content calendar action classification."
      >
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
      </SectionCard>

      {/* ── Section E: Decay vs Compounding Content ── */}
      <SectionCard
        title="E. Decay vs Compounding Content"
        description="Classifies owned content by trajectory. Compounding content with AI citation activity represents the highest-value assets to protect and scale."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[
            { label: 'Compounding URLs',       color: '#60FF80', desc: 'Traffic accelerating + AI cited' },
            { label: 'Stable URLs',            color: '#FFFC60', desc: 'Flat traffic, some AI activity' },
            { label: 'Decaying URLs',          color: '#FF4444', desc: 'Declining traffic, low AI citation' },
            { label: 'High AI / Low Traffic',  color: '#60FDFF', desc: 'AI-cited but no human traffic yet' },
            { label: 'High Traffic / No AI',   color: '#39A0FF', desc: 'Popular but not AI-indexed' },
            { label: 'No Activity',            color: '#8A8A8A', desc: 'Neither traffic nor AI citations' },
          ].map(({ label, color, desc }) => (
            <div key={label} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[11px] font-semibold text-white/60">{label}</span>
              </div>
              <span className="text-lg font-bold text-white/20">--</span>
              <span className="text-[10px] text-text-muted">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-text-muted">Requires GA4 page-level session trends (MoM) + Peec AI citation data to classify content trajectory.</p>
      </SectionCard>

      {/* ── Section F: Owned Content Cited in AI (PRD: 9 columns) ── */}
      <SectionCard
        title="F. Owned Content Cited in AI"
        description="Your owned domains and URLs that appear in AI-generated responses. Ranked by citation frequency."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL / Domain</Th>
                <Th>Topic / Cluster</Th>
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
                ownDomains.map(d => (
                  <tr key={d.domain}>
                    <Td><span className="font-medium text-white">{d.domain}</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td><span className="tabular-nums text-white">{d.citationRate > 0 ? d.citationRate.toFixed(1) + '%' : '--'}</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td>
                      {d.retrievedDelta !== 0 ? (
                        <span className={cn('text-xs font-semibold tabular-nums', d.retrievedDelta > 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
                          {d.retrievedDelta > 0 ? '+' : ''}{d.retrievedDelta.toFixed(1)}%
                        </span>
                      ) : <span className="text-white/40">--</span>}
                    </Td>
                    <Td><span className="text-[11px] text-white/50">Monitor and protect citation position</span></Td>
                  </tr>
                ))
              ) : (
                <EmptyBody cols={9} message="No owned-domain citation data available from Peec AI" />
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section G: Content Gaps (PRD: 3 sub-views) ── */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <div>
          <h3 className="text-sm font-bold text-white">G. Content Gaps</h3>
          <p className="mt-1 text-xs text-text-muted">
            Three views of content gap: pages with traffic but no AI citations, AI-cited pages without human traffic, and bot-crawled pages without citations.
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
                  <Th>Sessions (30d)</Th>
                  <Th>AI Citations</Th>
                  <Th>Content Type</Th>
                  <Th>Last Updated</Th>
                  <Th>AEO Fix Priority</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyBody cols={6} message="Requires GA4 page sessions + Peec AI owned-domain URL-level data" />
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
                  <Th>AI Citations</Th>
                  <Th>AI-Referred Sessions</Th>
                  <Th>Organic Sessions (30d)</Th>
                  <Th>Content Type</Th>
                  <Th>Recommended Action</Th>
                </tr>
              </thead>
              <tbody>
                <EmptyBody cols={6} message="Requires GA4 + Peec AI URL-level citation data" />
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: AI Bot Attention but No Citations/Visits */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#FFFC60]/10 text-[10px] font-bold text-[#FFFC60]">3</span>
            <span className="text-xs font-bold text-white/70">AI Bot Attention but No Citations or Visits</span>
          </div>
          <p className="text-[11px] text-text-muted">Pages AI crawlers visit but don't cite. Signals content quality or format issues preventing LLM extraction.</p>
          {agentData && agentData.topPaths.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>URL Path</Th>
                    <Th>AI Bot Visits</Th>
                    <Th>AI Citations</Th>
                    <Th>Bots Crawling</Th>
                    <Th>Response Status</Th>
                    <Th>Hypothesis</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {agentData.topPaths.slice(0, 10).map(p => (
                    <tr key={p.path}>
                      <Td><span className="font-mono text-[10px] text-white/60">{p.path}</span></Td>
                      <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
                      <Td><span className="text-white/40">--</span></Td>
                      <Td><span className="text-white/60">{bots.length} bots</span></Td>
                      <Td>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          p.status >= 400 ? 'bg-[#FF4444]/10 text-[#FF4444]'
                            : p.status >= 300 ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                            : 'bg-[#60FF80]/10 text-[#60FF80]'
                        )}>
                          {p.status}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[11px] text-white/50">
                          {p.status >= 400 ? 'Error page: fix or redirect'
                            : p.status >= 300 ? 'Redirect: verify final destination'
                            : 'Crawled but not cited; check content format'}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>URL</Th>
                    <Th>AI Bot Visits</Th>
                    <Th>AI Citations</Th>
                    <Th>Bots Crawling</Th>
                    <Th>Last Crawled</Th>
                    <Th>Hypothesis</Th>
                  </tr>
                </thead>
                <tbody>
                  <EmptyBody cols={6} message="No AI bot crawl data available. Check PEEC_AI_CUSTOMER_TOKEN configuration." />
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
          <h4 className="text-xs font-bold text-white/60">Top Competitor Domains</h4>
          {competitorDomains.length > 0 ? (
            <div className="flex flex-col gap-2">
              {competitorDomains.slice(0, 10).map(d => {
                const maxRetrieved = Math.max(...competitorDomains.slice(0, 10).map(x => x.retrieved), 1)
                const barWidth = (d.retrieved / maxRetrieved) * 100
                return (
                  <div key={d.domain} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-xs font-medium text-white/80" title={d.domain}>{d.domain}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-4 flex-1 overflow-hidden rounded bg-white/[0.04]">
                          <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-[10px] tabular-nums text-white/60">{d.citationRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-text-muted">No competitor domain data available from Peec AI</p>
          )}
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 2: Brand-Absent URLs */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-white/60">Brand-Absent Editorial URLs</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Domain</Th>
                  <Th>Type</Th>
                  <Th>Retrieved %</Th>
                  <Th>Citation Rate</Th>
                  <Th>Brand Present</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {editorialDomains.length > 0 ? (
                  editorialDomains.slice(0, 10).map(d => (
                    <tr key={d.domain}>
                      <Td><span className="font-medium text-white">{d.domain}</span></Td>
                      <Td>
                        <span className="rounded-full bg-[#39A0FF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#39A0FF]">
                          {d.type}
                        </span>
                      </Td>
                      <Td><span className="tabular-nums text-white">{d.retrieved.toFixed(1)}%</span></Td>
                      <Td><span className="tabular-nums text-white">{d.citationRate.toFixed(1)}%</span></Td>
                      <Td><span className="text-white/40">--</span></Td>
                    </tr>
                  ))
                ) : (
                  <EmptyBody cols={5} message="No editorial domain data from Peec AI" />
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* Sub-view 3: Repeated Competitor Pages */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs font-bold text-white/60">Repeated Competitor Pages</h4>
          <p className="text-xs text-text-muted">
            Specific competitor pages cited across multiple prompts. These are the pages your content needs to outperform.
          </p>
          <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">Requires URL-level citation data from Peec AI Pro</p>
          </div>
        </div>
      </SectionCard>

      {/* ── Section I: AI Systems Interacting with Our Content (LIVE from agent-analytics) ── */}
      <SectionCard
        title="I. AI Systems Interacting with Our Content"
        description="Which AI crawlers are actively indexing owned content, their visit frequency, and which pages they target most."
      >
        {agentData && bots.length > 0 ? (
          <>
            <div className={cn(
              'grid gap-3',
              `grid-cols-2 sm:grid-cols-${Math.min(bots.length, 4)} lg:grid-cols-${Math.min(bots.length, 6)}`,
            )}>
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
                        <Td><span className="text-white/30 text-[10px] font-mono">{bot.lastSeen ?? '--'}</span></Td>
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

      {/* ── Section J: Recommended Actions (PRD: 7-column data table) ── */}
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
              {/* Generate recommendations from available data */}
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
              {agentData && agentData.redirectHits > 10 && (
                <tr>
                  <Td><span className="font-medium text-white">Redirect chains</span></Td>
                  <Td><span className="text-white/60">{agentData.redirectHits} AI bot visits hitting redirects</span></Td>
                  <Td><span className="text-white/50">AI Bot Data</span></Td>
                  <Td><span className="text-white/60">Consolidate redirect chains to direct URLs</span></Td>
                  <Td><span className="text-white/50">AI bots may not follow all redirect hops</span></Td>
                  <Td><span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">Medium</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Dev</span></Td>
                </tr>
              )}
              {ownDomains.length === 0 && (
                <tr>
                  <Td><span className="font-medium text-white">All owned content</span></Td>
                  <Td><span className="text-white/60">No owned-domain citations detected</span></Td>
                  <Td><span className="text-white/50">Peec AI</span></Td>
                  <Td><span className="text-white/60">Add schema markup and FAQ sections to key pages</span></Td>
                  <Td><span className="text-white/50">Structured content earns higher AI citation rates</span></Td>
                  <Td><span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">High</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Content</span></Td>
                </tr>
              )}
              {competitorDomains.length > 0 && (
                <tr>
                  <Td><span className="font-medium text-white">Competitor-dominated clusters</span></Td>
                  <Td><span className="text-white/60">{competitorDomains.length} competitor domains cited in AI</span></Td>
                  <Td><span className="text-white/50">Peec AI</span></Td>
                  <Td><span className="text-white/60">Create targeted content for competitor-dominated prompt clusters</span></Td>
                  <Td><span className="text-white/50">Displace competitor citations with owned content</span></Td>
                  <Td><span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">Medium</span></Td>
                  <Td><span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">Content</span></Td>
                </tr>
              )}
              {(!agentData || agentData.errorPageHits === 0) && ownDomains.length > 0 && competitorDomains.length === 0 && (
                <EmptyBody cols={7} message="Connect content calendar and GA4 to generate URL-level recommendations" />
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[10px] text-text-muted">
          Opportunity Score = 30% human performance + 25% AI citation gap + 20% competitor pressure + 15% AI bot attention + 10% freshness
        </p>
      </div>

      <p className="text-xs text-text-muted">
        Content Impact Tracker
        {peecData && ' . Peec AI (live)'}
        {agentData && ` . ${totalBotVisits} AI bot visits (30d)`}
        {' . '}Content calendar + GA4 page-level data pending connection
      </p>
    </div>
  )
}
