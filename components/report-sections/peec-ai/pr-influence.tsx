import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getDomainCoverage, domainPromptIds, type DomainCoverage } from '@/lib/peec/url-citations'
import { getPRProofData } from '@/lib/pr-proof/client'
import type { PRPlacement } from '@/lib/pr-proof/types'
import { samplePRProofData } from '@/lib/demo-data/pr-proof'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SAMPLE_GA4_AI_REFERRAL_ROWS, SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS } from '@/lib/demo-data/ga4-pr-influence'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import { KpiCard } from '@/components/charts/kpi-card'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PEEC, GA4 } from '@/lib/peec/metric-definitions'
import type { AEOModel } from '@/lib/peec/models'
import { sumByModel, filterDomainRowsByModel } from '@/lib/peec/by-model'
import {
  PRPlacementMatchbackTable,
  TopEditorialDomainsTable,
  BrandAbsentEditorialDomainsTable,
  PromptClusterOpportunityMatrix,
  NextPitchOpportunitiesTable,
  type PRPlacementMatchbackRow,
  type TopEditorialDomainRow,
  type BrandAbsentEditorialDomainRow,
  type PromptClusterOpportunityRow,
  type NextPitchOpportunityRow,
} from './pr-influence-tables'

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
  coverage: DomainCoverage,
): MatchbackRow[] {
  // Build lookup: domain -> editorial domain data
  const domainLookup = new Map<string, TopDomain>()
  for (const d of editorialDomains) {
    domainLookup.set(d.domain.toLowerCase(), d)
  }

  return placements.map((p) => {
    const domainKey = p.domain.toLowerCase()
    const editorialMatch = domainLookup.get(domainKey)

    // Check if the domain is cited in any AI response
    const citedByAI = !!editorialMatch
    // Distinct tracked prompts in which a URL on this domain is cited, derived
    // from per-URL citation data (not trackedPrompts[].sources, which are
    // AI-engine ids and never match a domain).
    const promptCount = domainPromptIds(coverage, p.domain).length

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

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', demoMode = false, models = null }: { clientSlug: string; dateRange?: string; demoMode?: boolean; models?: AEOModel[] | null }) {
  // Date range setup for GA4 AI referral sessions
  const resolvedMain = parseDateRange(dateRange)
  const mainIso = `${resolvedMain.startDate},${resolvedMain.endDate}`
  const resolvedCompare = deriveCompareRange(dateRange, 'previous_period')
  const compareIso = resolvedCompare
    ? `${resolvedCompare.startDate},${resolvedCompare.endDate}`
    : null

  // Fetch all data sources in parallel with graceful degradation
  const [peecResult, prResult, aiReferralResult, compareAiResult, coverageResult] = await Promise.allSettled([
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
    getDomainCoverage(clientSlug),   // per-domain prompt coverage (matchback + Section C)
  ])

  let data    = peecResult.status === 'fulfilled' ? peecResult.value : null
  let prData  = prResult.status   === 'fulfilled' ? prResult.value   : null
  let aiReferralRows = aiReferralResult.status === 'fulfilled' ? (aiReferralResult.value?.rows ?? []) : []
  let compareAiRows  = compareAiResult.status  === 'fulfilled' ? (compareAiResult.value?.rows  ?? []) : []
  let coverage       = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {} }

  // Demo mode: force-substitute every data source so the demo never
  // mixes real client data with synthetic. `prIsDemo` is retained as
  // the boolean some render paths read, but it now equals demoMode.
  const prIsDemo = demoMode
  if (demoMode) {
    data           = samplePeecOverview()
    prData         = samplePRProofData()
    aiReferralRows = SAMPLE_GA4_AI_REFERRAL_ROWS
    compareAiRows  = SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS
    coverage       = { promptIdsByDomain: {}, tagIdsByDomain: {} }  // demo: matchback/§C use demo fallbacks
  }

  if (peecResult.status === 'rejected') console.error('[pr-influence] Peec error:', peecResult.reason)
  if (prResult.status   === 'rejected') console.error('[pr-influence] PR Proof error:', prResult.reason)

  // GA4 AI referral sessions computation
  const isAiSource = (source: unknown) =>
    (AI_REFERRER_DOMAINS as readonly string[]).some(d =>
      String(source ?? '').toLowerCase().includes(d)
    )

  // GA4 connected (query resolved) → a 0 is a real "no AI referrals", shown as 0.
  // Only when the query failed / GA4 is unconfigured do we show -- (no data).
  const aiReferralOk = demoMode || aiReferralResult.status === 'fulfilled'

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

  // ── KPI: AI Visibility % + Avg AI Position (model-filtered) ─────────────────
  // When a model filter is active, recompute from llmBreakdown filtered to
  // selected models. When no filter is active, fall back to the youMetrics
  // brand ranking (which aggregates across all models).
  const llmFiltered = models
    ? (data?.llmBreakdown ?? []).filter((row) => models.includes(row.model as AEOModel))
    : (data?.llmBreakdown ?? [])

  const filteredAiVisibilityPct = llmFiltered.length > 0
    ? llmFiltered.reduce((s, r) => s + r.visibility, 0) / llmFiltered.length
    : null

  const filteredAvgPosition = llmFiltered.length > 0
    ? llmFiltered.reduce((s, r) => s + r.position, 0) / llmFiltered.length
    : null

  // When a model filter is active, use the filtered llmBreakdown aggregates.
  // When no filter, use youMetrics (brand-level YTD aggregate) for display,
  // which includes delta. We only show the derived filtered values when models
  // is non-null so the delta is not misleadingly stale.
  const displayAiVisibility = models !== null
    ? (filteredAiVisibilityPct !== null ? fmt(filteredAiVisibilityPct) : '--')
    : (youMetrics ? fmt(youMetrics.visibility) : '--')
  const displayAiVisibilityDelta = models !== null ? undefined : youMetrics?.visibilityDelta

  const displayAvgPosition = models !== null
    ? (filteredAvgPosition !== null ? filteredAvgPosition.toFixed(1) : '--')
    : (youMetrics ? youMetrics.position.toFixed(1) : '--')
  const displayAvgPositionDelta = models !== null ? undefined : (youMetrics ? -youMetrics.positionDelta : undefined)

  // ── KPI: # AI Citations (model-filtered) ────────────────────────────────────
  // When a model filter is active, sum domainCitationsByModel across selected
  // models for all domains. When no filter, use the pre-aggregated totalCitations.
  const totalCitations = models !== null && data?.domainCitationsByModel
    ? Object.keys(data.domainCitationsByModel).reduce(
        (acc, domain) => acc + sumByModel(data!.domainCitationsByModel, domain, models),
        0,
      )
    : (data?.totalCitationsByRange['YTD'] ?? 0)

  // Build matchback: PR placements x Peec editorial domains
  const matchbackRows = prData && data
    ? buildMatchback(prData.placements, editorialDomains, coverage)
    : []

  // True once the coverage fetch returned data: a domain missing from it is a
  // known 0 (cited by no tracked prompt), not unknown. Empty map = fetch
  // failed / project unconfigured → keep -- for prompt count.
  const coverageAvailable = Object.keys(coverage.promptIdsByDomain).length > 0

  // ── Filter PR placement matchback rows by selected AI models ─────────────────
  // When a filter is active, keep only rows that have at least one cited AI
  // engine matching the selection. Rows with no AI engines at all are DROPPED
  // when a filter is active — they provide no signal for model-specific analysis.
  const filteredMatchbackRows = models
    ? matchbackRows.filter((r) => {
        if (!r.citedByAI || r.aiEnginesCiting.length === 0) return false
        return r.aiEnginesCiting.some((e) => models.includes(e as AEOModel))
      })
    : matchbackRows

  const placementsCitedByAI = filteredMatchbackRows.filter(r => r.citedByAI).length

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

  // Prompt Coverage % per editorial domain for Section C — share of tracked
  // prompts in which a URL on the domain is cited (from per-URL citation data).
  const totalEditPrompts = data?.trackedPrompts.length ?? 0
  const getEditorialPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalEditPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalEditPrompts * 100)
      : null

  // ── Serialize data for client components ───────────────────────────────────

  // Demo-mode look-up tables (kept here so the new client tables receive plain
  // serializable strings, not function references).
  const DEMO_PROMPT_CLUSTERS = ['Discovery', 'Comparison', 'How-to', 'Research']
  const DEMO_AI_ENGINES = [
    'ChatGPT, Claude',
    'Perplexity',
    'ChatGPT, Gemini',
    'Claude, Perplexity, Copilot',
    'ChatGPT',
    'Gemini, Perplexity',
    'ChatGPT, Claude, Gemini',
    'Perplexity, Copilot',
    'ChatGPT, Perplexity',
    'Claude',
    'ChatGPT, Gemini, Copilot',
    'Perplexity, Claude',
  ]
  const DEMO_PROMPT_COUNT = [14, 9, 22, 6, 31, 11, 18, 4, 27, 13, 8, 16]
  const DEMO_POST_PUBLISH_TREND = [18, 24, 12, 31, 9, 17, 28, 14, 22, 11, 26, 19]

  // 1. PR Placement Matchback rows — use filteredMatchbackRows (filtered by
  // selected AI models above) so the table and summary counts reflect the filter.
  const matchbackTableRows: PRPlacementMatchbackRow[] = filteredMatchbackRows.map((row, i) => ({
    outlet: row.outlet,
    domain: row.domain,
    headline: row.headline,
    link: row.link,
    publicationDate: row.publicationDate,
    promptCluster: prIsDemo ? DEMO_PROMPT_CLUSTERS[i % DEMO_PROMPT_CLUSTERS.length] : null,
    brandMentioned: row.brandMentioned,
    linkedMention: prIsDemo ? i % 3 !== 0 : null,
    citedByAI: row.citedByAI,
    aiEnginesCiting: prIsDemo
      ? DEMO_AI_ENGINES[i % DEMO_AI_ENGINES.length]
      : row.aiEnginesCiting.length > 0
        ? row.aiEnginesCiting.join(', ')
        : '',
    // Known 0 (no tracked prompt cites this domain) shows 0, not -- which reads
    // as missing data. -- only when coverage is unavailable.
    promptCount: prIsDemo
      ? DEMO_PROMPT_COUNT[i % DEMO_PROMPT_COUNT.length]
      : coverageAvailable ? row.promptCount : null,
    averagePosition: prIsDemo ? 1.4 + (i % 7) * 0.45 : row.averagePosition,
    postPublishTrend: prIsDemo ? DEMO_POST_PUBLISH_TREND[i % DEMO_POST_PUBLISH_TREND.length] : null,
  }))

  // 2. Top Editorial Domains rows — apply model filter via filterDomainRowsByModel.
  // First build the full list up to 15, then pass through the filter helper which
  // recomputes citationCount from per-model data and drops zero-count rows.
  // Note: citationCountDelta is intentionally left stale (v1 limitation — see helper).
  const rawTopEditorialRows: TopEditorialDomainRow[] = editorialDomains.slice(0, 15).map((d, idx) => {
    const hasPR = prIsDemo
      ? [true, false, true, true, false, true, false, true, false, true, false, true, true, false, true][idx % 15]
      : (prData?.uniqueDomains.some(pd => pd.toLowerCase() === d.domain.toLowerCase()) ?? false)
    return {
      domain: d.domain,
      citationCount: d.retrieved,
      citationCountDelta: d.retrievedDelta,
      promptCoverage: getEditorialPromptCoverage(d.domain),
      avgPosition: prIsDemo ? 1.5 + (idx % 5) * 0.4 : null,
      hasPR,
    }
  })
  const topEditorialRows: TopEditorialDomainRow[] = data?.domainCitationsByModel
    ? filterDomainRowsByModel(rawTopEditorialRows, data.domainCitationsByModel, models)
    : rawTopEditorialRows

  // 3. Brand-Absent Editorial Domains rows
  const DEMO_BRAND_ABSENT_TITLES = [
    'How AI is reshaping editorial coverage',
    'Inside the AEO playbook for 2026',
    'Five brands winning in AI search',
    'The new SEO is AEO',
    'Why traditional PR is broken',
    'What ChatGPT cites and why it matters',
    'The agencies leading AI-first marketing',
    'How brand visibility is changing in the LLM era',
  ]
  const DEMO_BRAND_ABSENT_SLUGS = [
    'ai-editorial-shift', 'aeo-playbook-2026', 'brands-winning-ai-search',
    'aeo-new-seo', 'pr-is-broken', 'what-chatgpt-cites',
    'ai-first-agencies', 'brand-visibility-llm-era',
  ]
  const DEMO_BRAND_ABSENT_COMPETITORS = [
    ['Ogilvy', 'Edelman'],
    ['Weber Shandwick'],
    ['FleishmanHillard', 'BCW'],
    ['Burson'],
    ['Edelman', 'Praytell'],
    ['Ogilvy'],
    ['BCW', 'Weber Shandwick'],
    ['FleishmanHillard'],
  ]
  // Build brand-absent rows using unfiltered citationCount first (needed for
  // priority bucketing), then apply the model filter. Priority is derived from
  // the base d.retrieved value so it reflects the real editorial weight of the
  // domain, not just the per-model slice.
  const rawBrandAbsentTableRows: BrandAbsentEditorialDomainRow[] = brandAbsentDomains.slice(0, 20).map((d, i) => {
    const priority: 'High' | 'Medium' | 'Low' = d.retrieved > 15 ? 'High' : d.retrieved > 5 ? 'Medium' : 'Low'
    const slug = DEMO_BRAND_ABSENT_SLUGS[i % DEMO_BRAND_ABSENT_SLUGS.length]
    return {
      domain: d.domain,
      articleTitle: prIsDemo ? DEMO_BRAND_ABSENT_TITLES[i % DEMO_BRAND_ABSENT_TITLES.length] : null,
      articleUrl: prIsDemo ? `https://${d.domain}/${slug}` : null,
      citationCount: d.retrieved,
      competitorsMentioned: prIsDemo
        ? DEMO_BRAND_ABSENT_COMPETITORS[i % DEMO_BRAND_ABSENT_COMPETITORS.length].join(', ')
        : null,
      brandMentioned: false,
      opportunityPriority: priority,
      suggestedAngle: 'Secure coverage or citation on this domain',
    }
  })
  const brandAbsentTableRows: BrandAbsentEditorialDomainRow[] = data?.domainCitationsByModel
    ? filterDomainRowsByModel(rawBrandAbsentTableRows, data.domainCitationsByModel, models)
    : rawBrandAbsentTableRows

  // 4. Prompt Cluster Opportunity Matrix rows
  const opportunityTableRows: PromptClusterOpportunityRow[] = opportunityRows.map((row) => ({
    cluster: row.cluster,
    count: row.count,
    editorialCitationDensity: row.editorialCitationDensity,
    brandCitationRate: row.brandCitationRate,
    brandMentionRate: row.avgVisibility,
    competitorPresence: row.competitorPresence,
    opportunityScore: row.opportunityScore,
  }))

  // 5. Next Pitch Opportunities rows
  const nextPitchRows: NextPitchOpportunityRow[] =
    opportunityRows.length > 0 && brandAbsentDomains.length > 0
      ? opportunityRows.slice(0, 8).map((row, i) => {
          const targetDomain = brandAbsentDomains[i % brandAbsentDomains.length]
          const priority: 'High' | 'Medium' | 'Low' =
            row.opportunityScore > 40 ? 'High' : row.opportunityScore > 20 ? 'Medium' : 'Low'
          return {
            cluster: row.cluster,
            missingDomain: targetDomain?.domain ?? '--',
            whyItMatters:
              row.avgVisibility < 20
                ? 'Brand absent from AI responses in this cluster'
                : 'Low brand visibility vs competitor presence',
            competitorPresence: row.competitorPresence,
            suggestedOutlet: targetDomain?.domain ?? 'TBD',
            suggestedAngle: `Secure expert quote or byline on ${row.cluster.toLowerCase()} topics`,
            priority,
          }
        })
      : []

  const nextPitchEmptyKind: 'no-prompts' | 'no-gaps' | 'has-rows' =
    nextPitchRows.length > 0
      ? 'has-rows'
      : opportunityRows.length === 0
        ? 'no-prompts'
        : 'no-gaps'

  return (
    <div className="space-y-8">

      {prIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── Section A: KPI Strip ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">How is AI-driven PR coverage performing?</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {/* AI Visibility %: filtered by selected models via llmBreakdown average */}
          <KpiCard
            title="AI Visibility %"
            value={displayAiVisibility}
            delta={displayAiVisibilityDelta}
            tooltip={`${PEEC.visibility.text} (Peec AI.) Shown YTD.${models ? ' Filtered to selected AI models.' : ''}`}
          />
          {/* Avg AI Position: filtered by selected models via llmBreakdown average */}
          <KpiCard
            title="Avg AI Position"
            value={displayAvgPosition}
            delta={displayAvgPositionDelta}
            invertDelta
            tooltip={`${PEEC.position.text} (Peec AI.) Shown YTD.${models ? ' Filtered to selected AI models.' : ''}`}
          />
          {/* # AI Citations: filtered via domainCitationsByModel sum when models active */}
          <KpiCard
            title="# AI Citations"
            value={data ? totalCitations.toLocaleString() : '--'}
            tooltip={`${PEEC.citations.text} (Peec AI.) Shown YTD.${models ? ' Filtered to selected AI models.' : ''}`}
          />
          {/* PR Placements Cited by AI: denominator reflects total filtered placements */}
          <KpiCard
            title="PR Placements Cited by AI"
            value={prData ? `${placementsCitedByAI} / ${models ? filteredMatchbackRows.length : prData.totalPlacements}` : '--'}
            tooltip={`PR Proof Library x Peec${models ? '. Filtered to selected AI models.' : ''}`}
          />
          {/* AI Referral Sessions: GA4 has no model dimension — not filtered.
              When a model filter is active, append a subtitle to make this clear. */}
          <KpiCard
            title="AI Referral Sessions"
            value={aiReferralOk ? aiSessions.toLocaleString() : '--'}
            delta={aiSessionsDelta}
            tooltip={aiReferralOk ? `${GA4.session.text} (GA4.) Shown for the selected date range.` : 'Requires GA4 AI referral data'}
            subValue={
              !aiReferralOk
                ? 'Requires GA4 AI referral data'
                : models
                  ? 'across all AI engines'
                  : undefined
            }
          />
          {/* Editorial Share, Brand Absent: reflects filtered brand-absent rows */}
          <KpiCard
            title="Editorial Share, Brand Absent"
            value={editorialDomains.length > 0
              ? `${brandAbsentTableRows.length} / ${models ? topEditorialRows.length + brandAbsentTableRows.length : editorialDomains.length}`
              : '--'}
            tooltip={`Editorial domains citing AI but missing brand${models ? '. Filtered to selected AI models.' : ''}`}
          />
        </div>
      </div>

      {/* ── Section B: PR Placement Matchback ── */}
      {/* totalPlacements reflects filtered set when a model filter is active */}
      <PRPlacementMatchbackTable
        rows={matchbackTableRows}
        totalPlacements={models ? filteredMatchbackRows.length : (prData?.totalPlacements ?? 0)}
        placementsCitedByAI={placementsCitedByAI}
        prDataAvailable={!!prData}
        isDemo={prIsDemo}
      />

      {/* ── Section C: Top Editorial Domains Cited by AI ── */}
      <TopEditorialDomainsTable rows={topEditorialRows} isDemo={prIsDemo} />

      {/* ── Section D: Brand-Absent Editorial Domains ── */}
      <BrandAbsentEditorialDomainsTable
        rows={brandAbsentTableRows}
        hasEditorialDomains={editorialDomains.length > 0}
        isDemo={prIsDemo}
      />

      {/* ── Section E: Prompt Cluster Opportunity Matrix ── */}
      {/* v1 limitation: opportunity scores (editorialCitationDensity, brandCitationRate,
          competitorPresence, opportunityScore) are computed from aggregated Peec data
          and are NOT re-computed per selected AI model. The matrix reflects all-model
          data regardless of the active model filter. Recomputing would require
          fetching per-model prompt cluster aggregates which is a Phase 6+ concern. */}
      <PromptClusterOpportunityMatrix rows={opportunityTableRows} />

      {/* ── Section F: Next Pitch Opportunities ── */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <span className="sr-only">Next Pitch Opportunities</span>
      </div>
      <NextPitchOpportunitiesTable rows={nextPitchRows} emptyKind={nextPitchEmptyKind} />

      {/* Scoring methodology */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How is the opportunity score calculated?</h3>
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
