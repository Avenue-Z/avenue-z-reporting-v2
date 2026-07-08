import { Suspense } from 'react'
import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getDomainCoverage, getUrlCitations, domainPromptIds, domainTagNames, avgCitationsByDomain, type DomainCoverage, type UrlCitation } from '@/lib/peec/url-citations'
import { getPRProofData } from '@/lib/pr-proof/client'
import type { PRPlacement } from '@/lib/pr-proof/types'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource, SHOW_AI_NARRATIVE } from '@/lib/constants'
import { Megaphone } from 'lucide-react'
import { SectionHeader } from './section-header'
import { PRInfluenceSynopsis } from './pr-influence-synopsis'
import { SynopsisSkeleton } from './synopsis-skeleton'
import type { PRInfluenceSynopsisContext } from '@/lib/peec/pr-influence-synopsis'
import { SentimentInsightsSection, SentimentSkeleton } from './sentiment-insights-section'
import { MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'
import { filterDomainRowsByModel } from '@/lib/peec/by-model'
import {
  TopEditorialDomainsTable,
  BrandAbsentEditorialDomainsTable,
  PromptClusterOpportunityMatrix,
  PRPlacementMatchbackTable,
  type TopEditorialDomainRow,
  type BrandAbsentEditorialDomainRow,
  type PromptClusterOpportunityRow,
  type PRPlacementMatchbackRow,
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
  brandMentioned: boolean
  citationRate: number
}

function buildMatchback(
  placements: PRPlacement[],
  editorialDomains: TopDomain[],
  coverage: DomainCoverage,
  urlCitations: UrlCitation[],
): MatchbackRow[] {
  // Build lookup: domain -> editorial domain data
  const domainLookup = new Map<string, TopDomain>()
  for (const d of editorialDomains) {
    domainLookup.set(d.domain.toLowerCase(), d)
  }

  // Real AI engine names per host (ChatGPT/Perplexity/…) from per-URL citation
  // data. These values match AEOModel, so the model filter works on them too.
  const host = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  const enginesByHost = new Map<string, Set<string>>()
  for (const c of urlCitations) {
    if (!c.engines.length) continue
    const k = host(c.domain)
    if (!enginesByHost.has(k)) enginesByHost.set(k, new Set())
    for (const e of c.engines) enginesByHost.get(k)!.add(e)
  }

  return placements.map((p) => {
    const domainKey = p.domain.toLowerCase()
    const editorialMatch = domainLookup.get(domainKey)

    // Real engine names citing a URL on this placement's host (empty when none).
    const aiEnginesCiting = [...(enginesByHost.get(host(p.domain)) ?? [])]
    // Cited if Peec lists the domain as an editorial citation OR a URL on it
    // carries engine-level citation data.
    const citedByAI = !!editorialMatch || aiEnginesCiting.length > 0
    // Distinct tracked prompts in which a URL on this domain is cited, derived
    // from per-URL citation data (not trackedPrompts[].sources, which are
    // AI-engine ids and never match a domain).
    const promptCount = domainPromptIds(coverage, p.domain).length

    return {
      ...p,
      citedByAI,
      aiEnginesCiting,
      promptCount,
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
  topDomains: TopDomain[],
  coverage: DomainCoverage,
): OpportunityRow[] {
  // Group prompts by cluster
  const clusterMap = new Map<string, TrackedPrompt[]>()
  for (const p of trackedPrompts) {
    if (!clusterMap.has(p.group)) clusterMap.set(p.group, [])
    clusterMap.get(p.group)!.push(p)
  }

  // FB-013 — per-cluster editorial citation share.
  //
  // Pre-FB-013 this was a single global value (totalEditorialCitations / N) assigned
  // identically to every cluster, so every bar in the FB-012 chart rendered at 100%.
  // Now we compute it per cluster from the data we already fetch:
  //   - clusterName -> tagId via coverage.tagNameById (reversed)
  //   - per-domain tag membership via coverage.tagIdsByDomain
  //   - per-domain citation share via topDomain.retrieved
  // editorialShare = sum(retrieved across editorial-typed domains tagged with this cluster)
  //                  divided by
  //                  sum(retrieved across ALL domains tagged with this cluster).
  const hostKey = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  const tagIdByName = new Map<string, string>()
  for (const [tagId, name] of Object.entries(coverage.tagNameById)) {
    tagIdByName.set(name, tagId)
  }
  const editorialHosts = new Set(editorialDomains.map((d) => hostKey(d.domain)))

  function clusterEditorialShare(clusterName: string): number {
    const tagId = tagIdByName.get(clusterName)
    if (!tagId) return 0  // unknown tag (e.g. cluster name without a tag-side match) -> 0
    let totalCit = 0
    let editorialCit = 0
    for (const d of topDomains) {
      const ids = coverage.tagIdsByDomain[hostKey(d.domain)] ?? []
      if (!ids.includes(tagId)) continue
      totalCit += d.retrieved
      if (editorialHosts.has(hostKey(d.domain))) editorialCit += d.retrieved
    }
    return totalCit > 0 ? (editorialCit / totalCit) * 100 : 0
  }

  return Array.from(clusterMap.entries())
    .map(([cluster, prompts]) => {
      const posPrompts = prompts.filter(p => p.position > 0)
      const avgVisibility = prompts.reduce((s, p) => s + p.visibility, 0) / prompts.length
      const avgSov = prompts.reduce((s, p) => s + p.sov, 0) / prompts.length

      // Per-cluster editorial citation density (0-100). See FB-013 comment above.
      const editorialCitationDensityPct = clusterEditorialShare(cluster)
      const editorialCitationDensity01  = Math.min(editorialCitationDensityPct / 100, 1)
      const brandAbsence       = Math.max(0, (100 - avgVisibility) / 100)
      const competitorPresence = Math.min(avgSov / 100, 1) // Higher competitor SOV = more competitive
      const publicationTier    = editorialDomains.length > 0 ? 0.5 : 0 // Placeholder; requires domain authority data

      // 35% editorial + 30% brand absence + 20% competitor + 15% tier
      const score = (0.35 * editorialCitationDensity01 + 0.30 * brandAbsence + 0.20 * competitorPresence + 0.15 * publicationTier) * 100

      return {
        cluster,
        count: prompts.length,
        avgVisibility,
        avgSov,
        avgPosition: posPrompts.length > 0 ? posPrompts.reduce((s, p) => s + p.position, 0) / posPrompts.length : 0,
        activeLLMs: new Set(prompts.flatMap(p => p.sources)).size,
        editorialCitationDensity: editorialCitationDensityPct,
        brandCitationRate: avgVisibility,
        competitorPresence: competitorPresence * 100,
        opportunityScore: score,
      }
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore) // highest opportunity first
}

// ── Main RSC ─────────────────────────────────────────────────────────────────

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', models = null }: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }) {
  // Date range setup for GA4 AI referral sessions
  const resolvedMain = parseDateRange(dateRange)
  const mainIso = `${resolvedMain.startDate},${resolvedMain.endDate}`
  const resolvedCompare = deriveCompareRange(dateRange, 'previous_period')
  const compareIso = resolvedCompare
    ? `${resolvedCompare.startDate},${resolvedCompare.endDate}`
    : null

  // Fetch all data sources in parallel with graceful degradation
  const [peecResult, prResult, aiReferralResult, compareAiResult, coverageResult, urlCitationsResult, urlCitationsPriorResult] = await Promise.allSettled([
    // Editorial domains / citations here are a stable all-time reference set, so
    // request YTD explicitly rather than the page date range.
    getPeecOverview(clientSlug, 'year_to_date'),
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
    getDomainCoverage(clientSlug),   // per-domain prompt coverage + tag names (matchback + Section C/D)
    getUrlCitations(clientSlug, { startDate: resolvedMain.startDate, endDate: resolvedMain.endDate }),
    resolvedCompare
      ? getUrlCitations(clientSlug, { startDate: resolvedCompare.startDate, endDate: resolvedCompare.endDate })
      : Promise.resolve([]),
  ])

  let data    = peecResult.status === 'fulfilled' ? peecResult.value : null
  let prData  = prResult.status   === 'fulfilled' ? prResult.value   : null
  let aiReferralRows = aiReferralResult.status === 'fulfilled' ? (aiReferralResult.value?.rows ?? []) : []
  let compareAiRows  = compareAiResult.status  === 'fulfilled' ? (compareAiResult.value?.rows  ?? []) : []
  let coverage       = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {} }
  let urlCitations   = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []
  let urlCitationsPrior   = urlCitationsPriorResult.status === 'fulfilled' ? urlCitationsPriorResult.value : []

  if (peecResult.status === 'rejected') console.error('[pr-influence] Peec error:', peecResult.reason)
  if (prResult.status   === 'rejected') console.error('[pr-influence] PR Proof error:', prResult.reason)

  // GA4 connected (query resolved) → a 0 is a real "no AI referrals", shown as 0.
  // Only when the query failed / GA4 is unconfigured do we show -- (no data).
  const aiReferralOk = aiReferralResult.status === 'fulfilled'

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
  const editorialDomains = (data?.topDomains ?? []).filter(d => d.type === 'Editorial')

  // Build matchback: PR placements x Peec editorial domains
  const matchbackRows = prData && data
    ? buildMatchback(prData.placements, editorialDomains, coverage, urlCitations)
    : []

  // True once the coverage fetch returned data: a domain missing from it is a
  // known 0 (cited by no tracked prompt), not unknown. Empty map = fetch
  // failed / project unconfigured → keep -- for prompt count.
  const coverageAvailable = Object.keys(coverage.promptIdsByDomain).length > 0

  // ── Per-URL citation derivations (Section C/D, matchback Avg. Citations) ─────
  // host (www-stripped, lowercased) — matches hostOf()/lookupHost() in url-citations.
  const hostKey = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  // Citation-count-weighted avg citations-per-answer per domain (Peec citation_avg).
  const avgCitByDomain = avgCitationsByDomain(urlCitations)
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

  // ── FB-029 · PR Placement Matchback rows for the new card ─────────────────
  // Tina v1 CSV R23 REVISION. The data layer (buildMatchback,
  // filteredMatchbackRows) survived FB-015's removal; the render + component
  // were what got deleted. Map filteredMatchbackRows to the simplified 5-col
  // row shape that matches Tina's literal title.
  const matchbackTableRows: PRPlacementMatchbackRow[] = filteredMatchbackRows.map((r) => ({
    outlet: r.outlet ?? r.domain,
    headline: r.headline ?? r.domain,
    link: r.link ?? '',
    publicationDate: r.publicationDate ?? '',
    citedByAI: r.citedByAI,
    aiEnginesCiting: r.aiEnginesCiting,
  }))

  // Build opportunity rows (Section E)
  const opportunityRows = data
    ? computeOpportunityRows(data.trackedPrompts, editorialDomains, data.topDomains ?? [], coverage)
    : []

  // Prompt Coverage % per editorial domain for Section C — share of tracked
  // prompts in which a URL on the domain is cited (from per-URL citation data).
  const totalEditPrompts = data?.trackedPrompts.length ?? 0
  const getEditorialPromptCoverage = (domain: string): number | null =>
    coverageAvailable && totalEditPrompts > 0
      ? Math.round(domainPromptIds(coverage, domain).length / totalEditPrompts * 100)
      : null

  // ── Serialize data for client components ───────────────────────────────────

  // 1. Top Editorial Domains rows — apply model filter via filterDomainRowsByModel.
  // First build the full list up to 15, then pass through the filter helper which
  // recomputes citationCount from per-model data and drops zero-count rows.
  // Note: citationCountDelta is intentionally left stale (v1 limitation — see helper).
  const rawTopEditorialRows: TopEditorialDomainRow[] = editorialDomains.slice(0, 15).map((d) => {
    const hasPR = prData?.uniqueDomains.some(pd => pd.toLowerCase() === d.domain.toLowerCase()) ?? false
    return {
      domain: d.domain,
      citationCount: d.retrieved,
      citationCountDelta: d.retrievedDelta,
      promptCoverage: getEditorialPromptCoverage(d.domain),
      avgCitations: avgCitByDomain[hostKey(d.domain)] ?? null,
      hasPR,
    }
  })
  // FB-062: when a model filter is on, filterDomainRowsByModel overwrites
  // citationCount with the raw per-model citation count (e.g. 5590) but the
  // renderer treats citationCount as a percentage (fmtPct -> "5590.0%").
  // Live audit caught domains showing 5590.0% / 1588.0% etc under a
  // ChatGPT-only filter -- same bug class as the V1 FB-051 199.9% issue.
  // Fix: after the per-model filter, normalize each row's citationCount to
  // a share-of-period (count / sum-of-counts * 100), so the column stays
  // bounded 0-100% in both unfiltered (d.retrieved %) and filtered (share
  // of model-scoped citations) modes. Mirrors the FB-051 pattern used by
  // Content Impact §H.1 (content-impact.tsx:1386-1388).
  const topEditorialRows: TopEditorialDomainRow[] = (() => {
    if (!data?.domainCitationsByModel || !models || models.length === 0) {
      return rawTopEditorialRows
    }
    const filtered = filterDomainRowsByModel(rawTopEditorialRows, data.domainCitationsByModel, models)
    const total = filtered.reduce((s, r) => s + r.citationCount, 0)
    // FB-063: when model filter is active, citationCountDelta is stale
    // (d.retrievedDelta is the all-model period-over-period change; pairing
    // it with a model-filtered current value produces a misleading arrow).
    // Zero it out so the renderer's Δ arrow disappears -- "no delta" is
    // honest; a wrong delta is not.
    return filtered.map((r) => ({
      ...r,
      citationCount: total > 0 ? (r.citationCount / total) * 100 : 0,
      citationCountDelta: null,
    }))
  })()

  // ── FB-028 · Top Editorial Opportunities (URL-level brand-absent, Tina R15+R16+R17) ──
  // Tina V1 R15 ✅: "5 columns (Publication / Article / Competitors Mentioned /
  // Citation Share / Delta of Citation Share)" — labels preserved verbatim.
  // Tina V1 R16 ⚠️: "When I look in Peec and look at URLs and filter to editorial,
  // there are thousands of articles." → URL-level data source + Peec's literal
  // editorial filter (classification === 'editorial').
  // Tina V1 R17 ⚠️: "must be something wrong with one of the filters" → drop the
  // legacy PR-placement-set misdefinition AND drop the positive-delta gate filter.
  //
  // Honest URL-level Citation Share = c.citationCount / sumOfAllPeriodCitations * 100.
  // Honest URL-level Delta = currentShare - priorShare (priorShare computed from
  // the new prior-period URL fetch added in Step 4).
  // One row per host (highest-cited brand-absent editorial URL on that host) so the
  // table reads cleanly when a single domain has many brand-absent URLs.

  // (a) Editorial check — Tina's literal Peec UI filter, with a host fallback so
  //     we never go silently empty if Peec exposes a different exact string.
  const editorialHostSet = new Set(editorialDomains.map((d) => hostKey(d.domain)))
  const isEditorialUrl = (c: typeof urlCitations[number]): boolean => {
    const cls = (c.classification ?? '').toLowerCase()
    if (cls === 'editorial') return true
    return editorialHostSet.has(hostKey(c.domain))
  }

  // (b) Per-period totals for honest URL-level share %.
  const totalCurrentCitations = urlCitations.reduce((s, c) => s + c.citationCount, 0)
  const totalPriorCitations   = urlCitationsPrior.reduce((s, c) => s + c.citationCount, 0)
  const priorShareByUrlKey    = new Map<string, number>()
  if (totalPriorCitations > 0) {
    for (const c of urlCitationsPrior) {
      priorShareByUrlKey.set(c.urlKey, (c.citationCount / totalPriorCitations) * 100)
    }
  }
  const shareOf = (c: typeof urlCitations[number]): number =>
    totalCurrentCitations > 0 ? (c.citationCount / totalCurrentCitations) * 100 : 0
  const deltaOf = (c: typeof urlCitations[number]): number =>
    shareOf(c) - (priorShareByUrlKey.get(c.urlKey) ?? 0)

  // (c) Build the row set — URL-level, brand-absent + editorial, one per host.
  // FB-028 follow-up: also apply the active model filter via c.engines so this
  // table reacts to model selection (same rule as filteredMatchbackRows above).
  const isModelMatch = (c: typeof urlCitations[number]): boolean => {
    if (!models || models.length === 0) return true
    if (c.engines.length === 0) return false  // no model-specific signal — drop
    return c.engines.some((e) => (models as string[]).includes(e))
  }
  const opportunityUrls = urlCitations.filter((c) => !c.mentionsYourBrand && isEditorialUrl(c) && isModelMatch(c))
  const byHost = new Map<string, typeof urlCitations[number]>()
  for (const u of opportunityUrls) {
    const k = hostKey(u.domain)
    const cur = byHost.get(k)
    if (!cur || u.citationCount > cur.citationCount) byHost.set(k, u)
  }
  const sortedByHost = Array.from(byHost.values()).sort((a, b) => b.citationCount - a.citationCount)

  const brandAbsentTableRowsAll: BrandAbsentEditorialDomainRow[] = sortedByHost
    .slice(0, 50)
    .map((c) => {
      const competitors = c.competitorBrandNames
      return {
        domain: c.domain,
        articleTitle: c.title ?? null,
        articleUrl: c.url ?? null,
        citationShare: shareOf(c),
        citationShareDelta: deltaOf(c),
        competitorsMentioned: competitors.length > 0 ? competitors.join(', ') : 'None',
      }
    })

  const brandAbsentTableRows: BrandAbsentEditorialDomainRow[] = brandAbsentTableRowsAll

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

  // ── FB-009-a · Executive Synopsis context ─────────────────────────────────
  // Inputs for the AI-generated executive synopsis card at the top of the
  // page. Truth-grounded: every value here comes from the same data the rest
  // of the page already renders. Synopsis is model-filter-agnostic by
  // design (matches the Overview synopsis behavior); the model filter
  // affects per-section tables, not the executive readout at the top.
  const synopsisContext: PRInfluenceSynopsisContext = {
    aiVisibility:           youMetrics ? youMetrics.visibility : null,
    aiVisibilityDelta:      youMetrics ? youMetrics.visibilityDelta : null,
    avgAiPosition:          youMetrics ? youMetrics.position : null,
    avgAiPositionDelta:     youMetrics ? youMetrics.positionDelta : null,
    totalAiCitations:       data?.totalCitations ?? 0,
    totalPlacements:        prData?.totalPlacements ?? 0,
    placementsCitedByAI,
    aiReferralSessions:     aiReferralOk ? aiSessions : null,
    aiReferralSessionsDelta: aiSessionsDelta ?? null,
    totalEditorialDomains:  editorialDomains.length,
    // FB-028: synopsis count + top list now source from the URL-level byHost map
    // for consistency with the visible table. Synopsis type uses `citationCount`
    // (raw integer count) per its existing shape; we pass the URL's raw count
    // there, not the share %.
    brandAbsentCount:       byHost.size,
    topBrandAbsentDomains:  sortedByHost.slice(0, 5).map((c) => ({
      domain: c.domain,
      citationCount: c.citationCount,
    })),
    topOpportunityClusters: opportunityRows.slice(0, 3).map(o => ({
      cluster: o.cluster,
      score: o.opportunityScore,
    })),
  }

  return (
    <div className="space-y-8">

      <SectionHeader
        icon={Megaphone}
        title="How is AI-driven PR coverage performing?"
        subtitle="Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice."
      />

      {/* ── FB-009-a · Executive Synopsis (replaces the prior Section A KPI Strip per Tina's FB-009-b ask) ── */}
      {SHOW_AI_NARRATIVE && (
        <Suspense fallback={<SynopsisSkeleton />}>
          <PRInfluenceSynopsis
            clientSlug={clientSlug}
            dateRange={dateRange}
            context={synopsisContext}
          />
        </Suspense>
      )}

      {/* ── FB-029 · PR Placement Matchback (restored under Exec Summary per Tina v1 CSV R23 REVISION) ── */}
      <PRPlacementMatchbackTable
        rows={matchbackTableRows}
        totalPlacements={prData?.totalPlacements ?? 0}
        placementsCitedByAI={placementsCitedByAI}
      />

      {/* ── FB-065 · Sentiment Insights (Profound-sourced, date + model reactive) ──
          Avenue Z only: Profound is a single-account feed, so this must never
          render for a client without a Profound account (e.g. Renaissance, which
          also has this section hidden). Gated on the slug for defense in depth. */}
      {clientSlug === 'avenue-z' && (
        <Suspense fallback={<SentimentSkeleton />}>
          <SentimentInsightsSection dateRange={dateRange} models={models} />
        </Suspense>
      )}

      {/* ── FB-012 · Top Editorial Domains + Prompt Cluster Opportunity, side-by-side ──
          Tina's recommended layout: Synopsis -> Sentiment -> Top Editorial -> Prompt Clusters,
          both reduced and placed next to each other. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Editorial Domains Cited by AI */}
        <TopEditorialDomainsTable rows={topEditorialRows} />
        {/* Prompt Cluster Opportunity (simple bar chart per FB-012) */}
        {/* v1 limitation: editorialCitationDensity is computed from aggregated Peec
            data and is NOT re-computed per selected AI model. The chart reflects
            all-model data regardless of the active model filter. */}
        <PromptClusterOpportunityMatrix rows={opportunityTableRows} />
      </div>

      {/* ── FB-014 · Top Editorial Opportunities (retitled from Brand-Absent Editorial Domains) ── */}
      <BrandAbsentEditorialDomainsTable
        rows={brandAbsentTableRows}
        hasEditorialDomains={editorialDomains.length > 0}
      />
    </div>
  )
}
