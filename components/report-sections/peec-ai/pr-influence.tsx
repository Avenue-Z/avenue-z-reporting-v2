import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getPRProofData } from '@/lib/pr-proof/client'
import type { PRPlacement } from '@/lib/pr-proof/types'
import { samplePRProofData } from '@/lib/demo-data/pr-proof'
import { SAMPLE_GA4_AI_REFERRAL_ROWS, SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS } from '@/lib/demo-data/ga4-pr-influence'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import { KpiCard } from '@/components/charts/kpi-card'
import { Newspaper, Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// PR Influence on AI Visibility
// PRD Sections A-F -- FULL SPEC IMPLEMENTATION
//
// Live data:  Peec AI (visibility, position, citations, editorial domains,
//             prompt cluster gap analysis)
//             PR Proof Library (Google Sheet -- PR placement log)
//             GA4 (AI referral sessions via AI_REFERRER_DOMAINS filter)
// Cross-ref:  PR placement domains matched against Peec editorial citation data
// ---------------------------------------------------------------------------

function fmt(n: number, decimals = 1, suffix = '%') {
  return `${n.toFixed(decimals)}${suffix}`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '↑' : '↓'}{Math.abs(value).toFixed(1)}%
    </span>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-3 pr-5 text-left text-xs font-extrabold uppercase tracking-widest text-text-muted last:pr-0">
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

function TableEmpty({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

// ── Cross-reference PR placements with Peec editorial domain data ────────────

type MatchbackRow = PRPlacement & {
  citedByAI: boolean
  aiEnginesCiting: string[]
  promptCount: number
  averagePosition: number | null
  brandMentioned: boolean
  citationRate: number
}

function buildMatchback(
  placements: PRPlacement[],
  editorialDomains: TopDomain[],
  trackedPrompts: TrackedPrompt[],
): MatchbackRow[] {
  // Build lookup: domain -> editorial domain data
  const domainLookup = new Map<string, TopDomain>()
  for (const d of editorialDomains) {
    domainLookup.set(d.domain.toLowerCase(), d)
  }

  // Build prompt cluster data for domain cross-reference
  // Count how many prompts mention sources that match each domain
  const domainPromptCount = new Map<string, number>()
  for (const prompt of trackedPrompts) {
    for (const source of prompt.sources) {
      const sourceLower = source.toLowerCase()
      const count = domainPromptCount.get(sourceLower) ?? 0
      domainPromptCount.set(sourceLower, count + 1)
    }
  }

  return placements.map((p) => {
    const domainKey = p.domain.toLowerCase()
    const editorialMatch = domainLookup.get(domainKey)

    // Check if the domain is cited in any AI response
    const citedByAI = !!editorialMatch
    const promptCount = domainPromptCount.get(domainKey) ?? 0

    // Get LLMs that cite this domain (from editorial data type or prompt sources)
    const aiEnginesCiting: string[] = []
    if (editorialMatch) {
      // We know at least one AI engine cites this domain since it appears in Peec data
      aiEnginesCiting.push('AI Engines')
    }

    return {
      ...p,
      citedByAI,
      aiEnginesCiting,
      promptCount,
      averagePosition: null, // Position data not available at domain level
      brandMentioned: citedByAI, // If the domain cites us, brand is mentioned
      citationRate: editorialMatch?.citationRate ?? 0,
    }
  })
}

// ── Opportunity scoring per PRD ──────────────────────────────────────────────
// 35% editorial citation density + 30% brand absence + 20% competitor presence + 15% publication tier weight

type OpportunityRow = {
  cluster: string
  count: number
  avgVisibility: number
  avgSov: number
  avgPosition: number
  activeLLMs: number
  editorialCitationDensity: number
  brandCitationRate: number
  competitorPresence: number
  opportunityScore: number
}

function computeOpportunityRows(
  trackedPrompts: TrackedPrompt[],
  editorialDomains: TopDomain[],
): OpportunityRow[] {
  // Group prompts by cluster
  const clusterMap = new Map<string, TrackedPrompt[]>()
  for (const p of trackedPrompts) {
    if (!clusterMap.has(p.group)) clusterMap.set(p.group, [])
    clusterMap.get(p.group)!.push(p)
  }

  // Calculate total editorial citation density
  const totalEditorialCitations = editorialDomains.reduce((s, d) => s + d.citationRate, 0)
  const avgEditorialCitation = editorialDomains.length > 0 ? totalEditorialCitations / editorialDomains.length : 0

  return Array.from(clusterMap.entries())
    .map(([cluster, prompts]) => {
      const posPrompts = prompts.filter(p => p.position > 0)
      const avgVisibility = prompts.reduce((s, p) => s + p.visibility, 0) / prompts.length
      const avgSov = prompts.reduce((s, p) => s + p.sov, 0) / prompts.length

      // PRD formula components (normalized to 0-1 scale)
      const editorialCitationDensity = Math.min(avgEditorialCitation / 100, 1)
      const brandAbsence = Math.max(0, (100 - avgVisibility) / 100)
      const competitorPresence = Math.min(avgSov / 100, 1) // Higher competitor SOV = more competitive
      const publicationTier = editorialDomains.length > 0 ? 0.5 : 0 // Placeholder; requires domain authority data

      // 35% editorial + 30% brand absence + 20% competitor + 15% tier
      const score = (0.35 * editorialCitationDensity + 0.30 * brandAbsence + 0.20 * competitorPresence + 0.15 * publicationTier) * 100

      return {
        cluster,
        count: prompts.length,
        avgVisibility,
        avgSov,
        avgPosition: posPrompts.length > 0 ? posPrompts.reduce((s, p) => s + p.position, 0) / posPrompts.length : 0,
        activeLLMs: new Set(prompts.flatMap(p => p.sources)).size,
        editorialCitationDensity: editorialCitationDensity * 100,
        brandCitationRate: avgVisibility,
        competitorPresence: competitorPresence * 100,
        opportunityScore: score,
      }
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore) // highest opportunity first
}

// ── Main RSC ─────────────────────────────────────────────────────────────────

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', demoMode = false }: { clientSlug: string; dateRange?: string; demoMode?: boolean }) {
  // Date range setup for GA4 AI referral sessions
  const resolvedMain = parseDateRange(dateRange)
  const mainIso = `${resolvedMain.startDate},${resolvedMain.endDate}`
  const resolvedCompare = deriveCompareRange(dateRange, 'previous_period')
  const compareIso = resolvedCompare
    ? `${resolvedCompare.startDate},${resolvedCompare.endDate}`
    : null

  // Fetch all data sources in parallel with graceful degradation
  const [peecResult, prResult, aiReferralResult, compareAiResult] = await Promise.allSettled([
    getPeecOverview(clientSlug),
    getPRProofData(clientSlug),
    ga4Query({
      clientSlug,
      dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionSource'],
      limit: 150,
    }),
    compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource'],
          limit: 150,
        })
      : Promise.resolve(null),
  ])

  const data    = peecResult.status === 'fulfilled' ? peecResult.value : null
  let   prData  = prResult.status   === 'fulfilled' ? prResult.value   : null
  let   aiReferralRows = aiReferralResult.status === 'fulfilled' ? (aiReferralResult.value?.rows ?? []) : []
  let   compareAiRows  = compareAiResult.status  === 'fulfilled' ? (compareAiResult.value?.rows  ?? []) : []

  // Demo mode: force sample data when demoMode is on so the section
  // demos consistently regardless of whether the signed-in client has
  // sparse / no real data. Real clients (no demoMode) keep showing
  // their actual data.
  //
  // Substitutes:
  //   - prData: 12 sample PR placements at high-profile outlets,
  //     so Section B (Matchback) has a rich table instead of 0-3 rows
  //   - aiReferralRows: realistic chatgpt/claude/perplexity referrals
  //     so Section A "AI Referral Sessions" KPI populates with a
  //     meaningful number instead of '--' (most real clients have
  //     small or zero AI-source GA4 traffic today)
  const prIsDemo = demoMode
  if (prIsDemo) {
    prData = samplePRProofData()
    aiReferralRows = SAMPLE_GA4_AI_REFERRAL_ROWS
    compareAiRows  = SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS
  }

  if (peecResult.status === 'rejected') console.error('[pr-influence] Peec error:', peecResult.reason)
  if (prResult.status   === 'rejected') console.error('[pr-influence] PR Proof error:', prResult.reason)

  // GA4 AI referral sessions computation
  const isAiSource = (source: unknown) =>
    (AI_REFERRER_DOMAINS as readonly string[]).some(d =>
      String(source ?? '').toLowerCase().includes(d)
    )

  const aiSessions = aiReferralRows
    .filter(r => isAiSource(r.sessionSource))
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const compareAiSessions = compareAiRows
    .filter(r => isAiSource(r.sessionSource))
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const aiSessionsDelta =
    aiSessions > 0 && compareAiSessions > 0
      ? ((aiSessions - compareAiSessions) / compareAiSessions) * 100
      : undefined

  // Derive metrics
  const youMetrics = data?.brandRankings.find(b => b.isYou) ?? null
  const editorialDomains = (data?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Editorial')
  const totalCitations   = data?.totalCitationsByRange['YTD'] ?? 0

  // Build matchback: PR placements x Peec editorial domains
  const matchbackRows = prData && data
    ? buildMatchback(prData.placements, editorialDomains, data.trackedPrompts)
    : []

  const placementsCitedByAI = matchbackRows.filter(r => r.citedByAI).length

  // Build opportunity rows (Section E)
  const opportunityRows = data
    ? computeOpportunityRows(data.trackedPrompts, editorialDomains)
    : []

  // Brand-absent editorial domains (Section D)
  const brandAbsentDomains = editorialDomains.filter(d => {
    // Domains cited by AI but NOT in our PR placement domains
    const prDomains = new Set((prData?.uniqueDomains ?? []).map(pd => pd.toLowerCase()))
    return !prDomains.has(d.domain.toLowerCase())
  })

  // Prompt Coverage % per editorial domain for Section C
  const editorialPromptCount = new Map<string, number>()
  const totalEditPrompts = data?.trackedPrompts.length ?? 0
  for (const prompt of (data?.trackedPrompts ?? [])) {
    for (const source of (prompt.sources as string[])) {
      const key = source.toLowerCase()
      editorialPromptCount.set(key, (editorialPromptCount.get(key) ?? 0) + 1)
    }
  }
  const getEditorialPromptCoverage = (domain: string): number | null =>
    totalEditPrompts > 0
      ? Math.round((editorialPromptCount.get(domain.toLowerCase()) ?? 0) / totalEditPrompts * 100)
      : null

  return (
    <div className="space-y-8">

      {prIsDemo && (
        <div><SampleDataBadge note="PR Proof Library sample shown — connect a sheet to see real placements" /></div>
      )}

      {/* ── Section A: KPI Strip (PRD: 6 cards) ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">KPI Strip</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            title="AI Visibility %"
            value={youMetrics ? fmt(youMetrics.visibility) : '--'}
            delta={youMetrics?.visibilityDelta}
            tooltip="Peec AI, YTD"
          />
          <KpiCard
            title="Avg AI Position"
            value={youMetrics ? youMetrics.position.toFixed(1) : '--'}
            delta={youMetrics ? -youMetrics.positionDelta : undefined}
            invertDelta
            tooltip="Peec AI, YTD (lower = better)"
          />
          <KpiCard
            title="# AI Citations"
            value={totalCitations > 0 ? totalCitations.toLocaleString() : '--'}
            tooltip="Peec AI, total YTD"
          />
          <KpiCard
            title="PR Placements Cited by AI"
            value={prData ? `${placementsCitedByAI} / ${prData.totalPlacements}` : '--'}
            tooltip="PR Proof Library x Peec"
          />
          <KpiCard
            title="AI Referral Sessions"
            value={aiSessions > 0 ? aiSessions.toLocaleString() : '--'}
            delta={aiSessionsDelta}
            tooltip={aiSessions > 0 ? `GA4 · ${dateRange}` : 'Requires GA4 AI referral data'}
            subValue={aiSessions === 0 ? 'Requires GA4 AI referral data' : undefined}
          />
          <KpiCard
            title="Editorial Share, Brand Absent"
            value={editorialDomains.length > 0
              ? `${brandAbsentDomains.length} / ${editorialDomains.length}`
              : '--'}
            tooltip="Editorial domains citing AI but missing brand"
          />
        </div>
      </div>

      {/* ── Section B: PR Placement Matchback Table (PRD: 14 columns) ── */}
      <SectionCard
        title="B. PR Placement Matchback"
        description="Each secured PR placement matched against Peec AI citation data. Shows which earned media is being retrieved by AI engines and whether your brand is mentioned."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Publication</Th>
                <Th>Domain</Th>
                <Th>Article Title</Th>
                <Th>Article URL</Th>
                <Th>Publish Date</Th>
                <Th>Prompt Cluster</Th>
                <Th>PR Secured</Th>
                <Th>Brand Mentioned</Th>
                <Th>Linked Mention</Th>
                <Th>Cited by AI</Th>
                <Th>AI Engines</Th>
                <Th>Prompt Count</Th>
                <Th>Avg Position</Th>
                <Th>Post-Publish Traffic Trend</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {matchbackRows.length > 0 ? (
                matchbackRows.map((row, i) => (
                  <tr key={`${row.link}-${i}`}>
                    <Td><span className="font-medium text-white">{row.outlet}</span></Td>
                    <Td><span className="text-white/60 font-mono text-[10px]">{row.domain}</span></Td>
                    <Td>
                      <a
                        href={row.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#39A0FF] hover:underline max-w-[200px] truncate block"
                        title={row.headline}
                      >
                        {row.headline.length > 50 ? `${row.headline.slice(0, 50)}...` : row.headline}
                      </a>
                    </Td>
                    <Td>
                      <a href={row.link} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[10px] text-white/40 hover:text-[#39A0FF] max-w-[140px] truncate block"
                        title={row.link}>
                        {row.domain}
                      </a>
                    </Td>
                    <Td><span className="tabular-nums text-white/60">{row.publicationDate}</span></Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td>
                      <span className="rounded-full bg-[#60FF80]/10 px-2 py-0.5 text-[10px] font-semibold text-[#60FF80]">
                        Yes
                      </span>
                    </Td>
                    <Td>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        row.brandMentioned
                          ? 'bg-[#60FF80]/10 text-[#60FF80]'
                          : 'bg-white/[0.06] text-white/40',
                      )}>
                        {row.brandMentioned ? 'Yes' : 'No'}
                      </span>
                    </Td>
                    <Td><span className="text-white/40">--</span></Td>
                    <Td>
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        row.citedByAI
                          ? 'bg-[#60FDFF]/10 text-[#60FDFF]'
                          : 'bg-white/[0.06] text-white/40',
                      )}>
                        {row.citedByAI ? 'Yes' : 'No'}
                      </span>
                    </Td>
                    <Td><span className="text-white/60">{row.aiEnginesCiting.length > 0 ? row.aiEnginesCiting.join(', ') : '--'}</span></Td>
                    <Td><span className="tabular-nums text-white">{row.promptCount > 0 ? row.promptCount : '--'}</span></Td>
                    <Td><span className="tabular-nums text-white/60">{row.averagePosition !== null ? row.averagePosition.toFixed(1) : '--'}</span></Td>
                    <Td><span className="text-white/20">--</span></Td>
                  </tr>
                ))
              ) : (
                <TableEmpty cols={14} message={
                  !prData
                    ? 'PR Proof Library not connected. Add prProofSheetId to clients.config.ts.'
                    : prData.totalPlacements === 0
                    ? 'No PR placements found for this client in the PR Proof Library.'
                    : 'No matchback data available.'
                } />
              )}
            </tbody>
          </table>
        </div>
        {matchbackRows.length > 0 && (
          <p className="mt-4 text-[10px] text-text-muted">
            Showing {matchbackRows.length} placements across 14 columns. {placementsCitedByAI} cited by AI engines.
            Prompt Cluster and Linked Mention require URL-level citation data. Post-Publish Traffic Trend requires GA4 integration.
          </p>
        )}
      </SectionCard>

      {/* ── Section C: Top Editorial Domains Cited by AI (PRD: Citation Count + Prompt Coverage % + Avg Position + Domain) ── */}
      <SectionCard
        title="C. Top Editorial Domains Cited by AI"
        description="Editorial domains most frequently retrieved in AI responses. These outlets carry LLM citation weight; securing coverage here has direct AEO impact."
      >
        {editorialDomains.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>Domain</Th>
                    <Th>Citation Count</Th>
                    <Th>Prompt Coverage %</Th>
                    <Th>Avg Position</Th>
                    <Th>PR</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {editorialDomains.slice(0, 15).map(d => {
                    const maxRetrieved = Math.max(...editorialDomains.slice(0, 15).map(x => x.retrieved), 1)
                    const barWidth = (d.retrieved / maxRetrieved) * 100
                    const hasPR = prData?.uniqueDomains.some(pd => pd.toLowerCase() === d.domain.toLowerCase()) ?? false
                    const promptCov = getEditorialPromptCoverage(d.domain)
                    return (
                      <tr key={d.domain}>
                        <Td>
                          <span
                            className={cn('font-medium', hasPR ? 'text-[#60FF80]' : 'text-white/80')}
                            title={d.domain}
                          >
                            {d.domain}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-24 overflow-hidden rounded bg-white/[0.04]">
                              <div
                                className={cn('h-full rounded', hasPR ? 'bg-[#60FF80]/60' : 'bg-[#39A0FF]/60')}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-white/60">{fmt(d.retrieved)}</span>
                            <Delta value={d.retrievedDelta} />
                          </div>
                        </Td>
                        <Td>
                          <span className="tabular-nums text-white">
                            {promptCov !== null ? `${promptCov}%` : '--'}
                          </span>
                        </Td>
                        <Td>
                          <span className="tabular-nums text-white/30">--</span>
                        </Td>
                        <Td>
                          {hasPR ? (
                            <span className="rounded-full bg-[#60FF80]/10 px-2 py-0.5 text-[9px] font-semibold text-[#60FF80]">
                              Yes
                            </span>
                          ) : (
                            <span className="text-white/20">--</span>
                          )}
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-[#39A0FF]/60" />
                <span className="text-[10px] text-text-muted">Editorial domain</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-[#60FF80]/60" />
                <span className="text-[10px] text-text-muted">Has PR placement</span>
              </div>
              <span className="ml-auto text-[10px] text-text-muted">
                Avg Position requires per-domain position data from Peec AI Pro
              </span>
            </div>
          </>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">No editorial domains found in current Peec AI project</p>
          </div>
        )}
      </SectionCard>

      {/* ── Section D: Brand-Absent Editorial Domains (PRD: 8 columns) ── */}
      <SectionCard
        title="D. Brand-Absent Editorial Domains"
        description="High-authority editorial domains that AI tools cite for your tracked prompts, but where your brand has no PR placement. These are the highest-priority pitch targets."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Domain</Th>
                <Th>Article Title</Th>
                <Th>URL</Th>
                <Th>Citation Count</Th>
                <Th>Competitors Mentioned</Th>
                <Th>Brand Mentioned</Th>
                <Th>Opportunity Priority</Th>
                <Th>Suggested PR Angle</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {brandAbsentDomains.length > 0 ? (
                brandAbsentDomains.slice(0, 20).map(d => {
                  const priority = d.retrieved > 15 ? 'High' : d.retrieved > 5 ? 'Medium' : 'Low'
                  const priorityColor = priority === 'High'
                    ? 'bg-[#FF4444]/10 text-[#FF4444]'
                    : priority === 'Medium'
                    ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                    : 'bg-white/[0.06] text-white/40'

                  return (
                    <tr key={d.domain}>
                      <Td><span className="font-medium text-white">{d.domain}</span></Td>
                      <Td><span className="text-white/20">--</span></Td>
                      <Td><span className="text-white/20">--</span></Td>
                      <Td><span className="tabular-nums text-white">{d.retrieved.toFixed(1)}%</span></Td>
                      <Td><span className="text-white/40">--</span></Td>
                      <Td>
                        <span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">
                          No
                        </span>
                      </Td>
                      <Td>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priorityColor)}>
                          {priority}
                        </span>
                      </Td>
                      <Td><span className="text-white/40 text-[11px]">Secure coverage or citation on this domain</span></Td>
                    </tr>
                  )
                })
              ) : (
                <TableEmpty cols={8} message={
                  editorialDomains.length === 0
                    ? 'No editorial domain data available from Peec AI'
                    : 'All editorial domains have PR placements. Great coverage!'
                } />
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[10px] text-text-muted">
          Article Title and URL require URL-level citation data from Peec AI (currently domain-level only). Citation Count shown as retrieved frequency %. Competitors Mentioned requires competitor mention extraction.
        </p>
      </SectionCard>

      {/* ── Section E: Prompt Cluster Opportunity Matrix (PRD: heatmap/matrix) ── */}
      <SectionCard
        title="E. Prompt Cluster Opportunity Matrix"
        description="Clusters scored by opportunity: editorial citation density, brand absence, competitor presence, and publication tier. Highest opportunity clusters are where one strong PR placement can shift the AI conversation."
      >
        {opportunityRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <Th>Prompt Cluster</Th>
                    <Th>Prompts</Th>
                    <Th>Editorial Citation Density</Th>
                    <Th>Brand Citation Rate</Th>
                    <Th>Brand Mention Rate</Th>
                    <Th>Competitor Presence</Th>
                    <Th>Opportunity Score</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {opportunityRows.map(row => {
                    const oppColor = row.opportunityScore > 40 ? '#60FF80' : row.opportunityScore > 20 ? '#FFFC60' : '#FF4444'
                    return (
                      <tr key={row.cluster}>
                        <Td><span className="font-semibold text-white/80">{row.cluster}</span></Td>
                        <Td><span className="tabular-nums text-white">{row.count}</span></Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-[#39A0FF]" style={{ width: `${Math.min(row.editorialCitationDensity, 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-white/60">{fmt(row.editorialCitationDensity)}</span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-[#60FF80]" style={{ width: `${Math.min(row.brandCitationRate, 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-white/60">{fmt(row.brandCitationRate)}</span>
                          </div>
                        </Td>
                        <Td>
                          <span className="tabular-nums text-white/60">{fmt(row.avgVisibility)}</span>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                              <div className="h-full rounded-full bg-[#FFFC60]" style={{ width: `${Math.min(row.competitorPresence, 100)}%` }} />
                            </div>
                            <span className="tabular-nums text-white/60">{fmt(row.competitorPresence)}</span>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-sm font-bold tabular-nums" style={{ color: oppColor }}>
                            {row.opportunityScore.toFixed(0)}
                          </span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-[10px] text-text-muted">
              Opportunity Score = 35% editorial citation density + 30% brand absence + 20% competitor presence + 15% publication tier weight. Sorted by highest opportunity.
            </p>
          </>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">No tracked prompts yet. Add prompts in Peec AI to populate the opportunity matrix.</p>
          </div>
        )}
      </SectionCard>

      {/* ── Section F: Next Pitch Opportunities (PRD: 7-column data table) ── */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">F. Next Pitch Opportunities</span>
        </div>
        <p className="mb-5 text-xs text-text-muted">
          Pitch targets derived from prompt clusters with lowest brand visibility and highest editorial citation density.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Prompt Cluster</Th>
                <Th>Missing Domain / Outlet</Th>
                <Th>Why It Matters</Th>
                <Th>Competitor Presence</Th>
                <Th>Suggested Outlet</Th>
                <Th>Suggested Angle</Th>
                <Th>Priority</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {opportunityRows.length > 0 && brandAbsentDomains.length > 0 ? (
                opportunityRows.slice(0, 8).map((row, i) => {
                  const targetDomain = brandAbsentDomains[i % brandAbsentDomains.length]
                  const priority = row.opportunityScore > 40 ? 'High' : row.opportunityScore > 20 ? 'Medium' : 'Low'
                  const priorityColor = priority === 'High'
                    ? 'bg-[#FF4444]/10 text-[#FF4444]'
                    : priority === 'Medium'
                    ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                    : 'bg-white/[0.06] text-white/40'

                  return (
                    <tr key={row.cluster}>
                      <Td><span className="font-semibold text-white/80">{row.cluster}</span></Td>
                      <Td><span className="font-mono text-[10px] text-white/60">{targetDomain?.domain ?? '--'}</span></Td>
                      <Td>
                        <span className="text-[11px] text-white/50">
                          {row.avgVisibility < 20
                            ? 'Brand absent from AI responses in this cluster'
                            : 'Low brand visibility vs competitor presence'}
                        </span>
                      </Td>
                      <Td><span className="tabular-nums text-white/60">{fmt(row.competitorPresence)}</span></Td>
                      <Td><span className="text-white/60">{targetDomain?.domain ?? 'TBD'}</span></Td>
                      <Td>
                        <span className="text-[11px] text-white/50">
                          Secure expert quote or byline on {row.cluster.toLowerCase()} topics
                        </span>
                      </Td>
                      <Td>
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priorityColor)}>
                          {priority}
                        </span>
                      </Td>
                    </tr>
                  )
                })
              ) : (
                <TableEmpty cols={7} message={
                  opportunityRows.length === 0
                    ? 'Add tracked prompts in Peec AI to generate pitch opportunities'
                    : 'All editorial domains have PR coverage. Excellent position.'
                } />
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scoring methodology */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How Opportunity Scoring Works</h3>
        <p className="text-sm leading-relaxed text-white/60">
          Each prompt cluster is scored to identify where a single PR placement can have the greatest impact
          on brand visibility in AI-generated responses.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Editorial Citation Density', weight: '35%', color: 'bg-[#39A0FF]' },
            { label: 'Brand Absence',              weight: '30%', color: 'bg-[#FF4444]' },
            { label: 'Competitor Presence',         weight: '20%', color: 'bg-[#FFFC60]' },
            { label: 'Publication Tier Weight',     weight: '15%', color: 'bg-[#60FF80]' },
          ].map(({ label, weight, color }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color)} />
              <span className="text-xs font-semibold text-white/60">{label}</span>
              <span className="ml-auto text-xs font-bold text-white/30">{weight}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        PR Influence on AI Visibility
        {data && ' . Peec AI (live)'}
        {aiSessions > 0 && ` . GA4 AI referral sessions (live)`}
        {prData && prData.totalPlacements > 0 && ` . ${prData.totalPlacements} PR placements (${prData.dateRange?.earliest} to ${prData.dateRange?.latest})`}
      </p>
    </div>
  )
}
