import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getDomainCoverage, getUrlCitations, domainPromptIds, domainTagNames, avgCitationsByDomain, type DomainCoverage, type UrlCitation } from '@/lib/peec/url-citations'
import { getPRProofData } from '@/lib/pr-proof/client'
import type { PRPlacement } from '@/lib/pr-proof/types'
import { samplePRProofData } from '@/lib/demo-data/pr-proof'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SAMPLE_GA4_AI_REFERRAL_ROWS, SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS } from '@/lib/demo-data/ga4-pr-influence'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource } from '@/lib/constants'
import { postPublishTrend, addDays } from '@/lib/ga4/content-derive'
import { Sparkles, Megaphone } from 'lucide-react'
import { SectionHeader } from './section-header'
import { PRInfluenceSynopsis } from './pr-influence-synopsis'
import type { PRInfluenceSynopsisContext } from '@/lib/peec/pr-influence-synopsis'
import { cn } from '@/lib/utils'
import { MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'
import { filterDomainRowsByModel } from '@/lib/peec/by-model'
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
  const [peecResult, prResult, aiReferralResult, compareAiResult, coverageResult, urlCitationsResult] = await Promise.allSettled([
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
    getUrlCitations(clientSlug),     // per-URL citations (Section D article fields, avg position)
  ])

  let data    = peecResult.status === 'fulfilled' ? peecResult.value : null
  let prData  = prResult.status   === 'fulfilled' ? prResult.value   : null
  let aiReferralRows = aiReferralResult.status === 'fulfilled' ? (aiReferralResult.value?.rows ?? []) : []
  let compareAiRows  = compareAiResult.status  === 'fulfilled' ? (compareAiResult.value?.rows  ?? []) : []
  let coverage       = coverageResult.status === 'fulfilled'
    ? coverageResult.value
    : { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, tagNameById: {} }
  let urlCitations   = urlCitationsResult.status === 'fulfilled' ? urlCitationsResult.value : []

  // Demo mode: force-substitute every data source so the demo never
  // mixes real client data with synthetic. `prIsDemo` is retained as
  // the boolean some render paths read, but it now equals demoMode.
  const prIsDemo = demoMode
  if (demoMode) {
    data           = samplePeecOverview()
    prData         = samplePRProofData()
    aiReferralRows = SAMPLE_GA4_AI_REFERRAL_ROWS
    compareAiRows  = SAMPLE_GA4_AI_REFERRAL_COMPARE_ROWS
    coverage       = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, tagNameById: {} }  // demo: matchback/§C/§D use demo fallbacks
    urlCitations   = []  // demo: §D uses demo fallbacks
  }

  if (peecResult.status === 'rejected') console.error('[pr-influence] Peec error:', peecResult.reason)
  if (prResult.status   === 'rejected') console.error('[pr-influence] PR Proof error:', prResult.reason)

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
  const editorialDomains = (data?.topDomains ?? []).filter(d => d.type === 'Editorial')

  // Build matchback: PR placements x Peec editorial domains
  const matchbackRows = prData && data
    ? buildMatchback(prData.placements, editorialDomains, coverage, urlCitations)
    : []

  // True once the coverage fetch returned data: a domain missing from it is a
  // known 0 (cited by no tracked prompt), not unknown. Empty map = fetch
  // failed / project unconfigured → keep -- for prompt count.
  const coverageAvailable = Object.keys(coverage.promptIdsByDomain).length > 0

  // ── PR §B · Post-Publish Traffic Trend (GA4-5) ──────────────────────────────
  // Per placement: signed % change in site-wide AI-referred sessions in the
  // window after its publish date vs. an equal window before. One GA4 query of
  // AI-referred sessions by date — from the earliest placement (minus a window)
  // to today — feeds every row. Site-wide proxy: GA4 has no per-placement
  // dimension, so this is the lift around publish, not causal attribution.
  const trendToday = new Date().toISOString().slice(0, 10)
  const toIsoDate = (s: string | null | undefined): string | null => {
    if (!s) return null
    const t = Date.parse(s)
    return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
  }
  const aiByDate: Record<string, number> = {}
  let trendOk = false
  const earliestPlacement = toIsoDate(prData?.dateRange?.earliest)
  if (!demoMode && earliestPlacement && (prData?.placements.length ?? 0) > 0) {
    try {
      const res = await ga4Query({
        clientSlug,
        dateRange: `${addDays(earliestPlacement, -30)},${trendToday}`,
        metrics: ['sessions'],
        dimensions: ['date', 'sessionSource'],
        limit: 100000,
      })
      trendOk = true
      for (const row of res.rows) {
        if (!isAiSource(row.sessionSource)) continue
        const ds = String(row.date ?? '')
        const iso = ds.length === 8 ? `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}` : ds
        aiByDate[iso] = (aiByDate[iso] ?? 0) + (Number(row.sessions) || 0)
      }
    } catch (e) {
      console.error('[pr-influence] GA4 post-publish trend error:', e)
    }
  }
  const placementTrend = (publicationDate: string): number | null => {
    const pub = toIsoDate(publicationDate)
    return trendOk && pub ? postPublishTrend(pub, trendToday, aiByDate) : null
  }

  // ── Per-URL citation derivations (Section C/D, matchback Avg. Citations) ─────
  // host (www-stripped, lowercased) — matches hostOf()/lookupHost() in url-citations.
  const hostKey = (s: string) => s.trim().toLowerCase().replace(/^www\./, '')
  // Citation-count-weighted avg citations-per-answer per domain (Peec citation_avg).
  const avgCitByDomain = avgCitationsByDomain(urlCitations)
  // Representative brand-absent URL per host: the highest-cited URL on that host
  // where our brand is not mentioned — used for Section D Article Title/URL/Competitors.
  const topBrandAbsentUrlByHost = new Map<string, UrlCitation>()
  for (const c of urlCitations) {
    if (c.mentionsYourBrand) continue
    const k = hostKey(c.domain)
    const cur = topBrandAbsentUrlByHost.get(k)
    if (!cur || c.citationCount > cur.citationCount) topBrandAbsentUrlByHost.set(k, c)
  }

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
    // Prompt Cluster = themes (tags) this domain is cited under, joined.
    // "None" when coverage loaded but the domain has no theme; -- only when
    // coverage is unavailable (fetch failed / unconfigured).
    promptCluster: prIsDemo
      ? DEMO_PROMPT_CLUSTERS[i % DEMO_PROMPT_CLUSTERS.length]
      : coverageAvailable ? (domainTagNames(coverage, row.domain).join(', ') || 'None') : null,
    brandMentioned: row.brandMentioned,
    // Pending-data placeholder (--): the PR Proof sheet has no linked-mention /
    // backlink column. Whether a placement hyperlinks to the client lives in the
    // article HTML, not the sheet. To enable: add a "Linked Mention" Yes/No column
    // + wire it in lib/pr-proof/client.ts. See docs/aeo-empty-fields-diagnosis.md §5.
    linkedMention: prIsDemo ? i % 3 !== 0 : null,
    citedByAI: row.citedByAI,
    aiEnginesCiting: prIsDemo
      ? DEMO_AI_ENGINES[i % DEMO_AI_ENGINES.length]
      : row.aiEnginesCiting.length > 0
        ? row.aiEnginesCiting.map((e) => MODEL_DISPLAY_LABELS[e as AEOModel] ?? e).join(', ')
        : row.citedByAI ? 'AI Engines' : 'Not cited',
    // Known 0 (no tracked prompt cites this domain) shows 0, not -- which reads
    // as missing data. -- only when coverage is unavailable.
    promptCount: prIsDemo
      ? DEMO_PROMPT_COUNT[i % DEMO_PROMPT_COUNT.length]
      : coverageAvailable ? row.promptCount : null,
    avgCitations: prIsDemo ? 1.4 + (i % 7) * 0.45 : (avgCitByDomain[hostKey(row.domain)] ?? null),
    postPublishTrend: prIsDemo ? DEMO_POST_PUBLISH_TREND[i % DEMO_POST_PUBLISH_TREND.length] : placementTrend(row.publicationDate),
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
      avgCitations: prIsDemo ? 1.5 + (idx % 5) * 0.4 : (avgCitByDomain[hostKey(d.domain)] ?? null),
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
    // Representative brand-absent URL cited on this editorial domain (top by citations).
    const topUrl = topBrandAbsentUrlByHost.get(hostKey(d.domain))
    return {
      domain: d.domain,
      articleTitle: prIsDemo ? DEMO_BRAND_ABSENT_TITLES[i % DEMO_BRAND_ABSENT_TITLES.length] : (topUrl?.title ?? null),
      articleUrl: prIsDemo ? `https://${d.domain}/${slug}` : (topUrl?.url ?? null),
      citationCount: d.retrieved,
      // "None" when we found the article but it named no competitors; -- only
      // when there's no representative article for the domain at all.
      competitorsMentioned: prIsDemo
        ? DEMO_BRAND_ABSENT_COMPETITORS[i % DEMO_BRAND_ABSENT_COMPETITORS.length].join(', ')
        : (topUrl ? (topUrl.competitorBrandNames.length > 0 ? topUrl.competitorBrandNames.join(', ') : 'None') : null),
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
    brandAbsentCount:       brandAbsentDomains.length,
    topBrandAbsentDomains:  brandAbsentDomains.slice(0, 5).map(d => ({
      domain: d.domain,
      citationCount: d.retrieved,
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

      {prIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── FB-009-a · Executive Synopsis (replaces the prior Section A KPI Strip per Tina's FB-009-b ask) ── */}
      <PRInfluenceSynopsis
        clientSlug={clientSlug}
        dateRange={dateRange}
        context={synopsisContext}
      />

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
      <TopEditorialDomainsTable rows={topEditorialRows} isDemo={prIsDemo} prDataAvailable={prData != null} />

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
