import { Suspense } from 'react'
import { SHOW_AI_NARRATIVE } from '@/lib/constants'
import { Megaphone } from 'lucide-react'
import { SectionHeader } from './section-header'
import { PRInfluenceSynopsis } from './pr-influence-synopsis'
import { SynopsisSkeleton } from './synopsis-skeleton'
import { SentimentInsightsSection, SentimentSkeleton } from './sentiment-insights-section'
import type { AEOModel } from '@/lib/peec/models'
import {
  TopEditorialDomainsTable,
  BrandAbsentEditorialDomainsTable,
  PromptClusterOpportunityMatrix,
  PRPlacementMatchbackTable,
} from './pr-influence-tables'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { buildPrInfluenceCtx } from './pr-influence/ctx'

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

// ── Main RSC ─────────────────────────────────────────────────────────────────

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', models = null }: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }) {
  const ctx = await buildPrInfluenceCtx({ clientSlug, dateRange, models })

  return (
    <div className="space-y-8">

      <SharedPartsHeader viewKey="peec-ai:pr-influence" clientSlug={clientSlug} />

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
            context={ctx.synopsisContext}
          />
        </Suspense>
      )}

      {/* ── FB-067 · PR Placement Matchback (all-time placements, cited within the selected timeframe) ── */}
      <PRPlacementMatchbackTable
        rows={ctx.matchback.rows}
        totalPlacements={ctx.totalPlacements}
        placementsCitedByAI={ctx.matchback.citedCount}
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
        <TopEditorialDomainsTable rows={ctx.topEditorialRows} />
        {/* Prompt Cluster Opportunity (simple bar chart per FB-012) */}
        {/* v1 limitation: editorialCitationDensity is computed from aggregated Peec
            data and is NOT re-computed per selected AI model. The chart reflects
            all-model data regardless of the active model filter. */}
        <PromptClusterOpportunityMatrix rows={ctx.opportunityTableRows} />
      </div>

      {/* ── FB-014 · Top Editorial Opportunities (retitled from Brand-Absent Editorial Domains) ── */}
      <BrandAbsentEditorialDomainsTable
        rows={ctx.brandAbsentTableRows}
        hasEditorialDomains={ctx.hasEditorialDomains}
      />
    </div>
  )
}
