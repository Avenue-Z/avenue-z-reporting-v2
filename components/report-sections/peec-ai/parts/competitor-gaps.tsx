import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx, ReportAudience } from '../ctx'
import type { PeecOverview, TrackedPrompt } from '@/lib/peec/client'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getCoverageProjection, EMPTY_COVERAGE_PROJECTION } from '@/lib/peec/coverage-projection'
import { getUrlCitations } from '@/lib/peec/url-citations'
import { buildBrandAbsentRows, toCompetitorGapRows } from '@/lib/peec/competitor-tables'
import { CompetitorUrlsBrandAbsentTable } from '../competitor-tables'
import { CompetitorCard, CompetitorCardSkeleton } from './competitor-card'

// Spec copy, verbatim. Rendered as-is rather than from resolved.label, which falls back to the
// part id when the section_templates row carries no label for it.
const TITLE = "Where competitors are cited and you aren't"

/** H2 (moved from Content Impact, D-3): cited pages that name a competitor and not the brand. */
export async function CompetitorGapsSection({
  clientSlug,
  dateRange,
  modelActive,
  audience,
  trackedPrompts,
}: {
  clientSlug: string | undefined
  dateRange: string | undefined
  modelActive: boolean
  audience: ReportAudience
  trackedPrompts: TrackedPrompt[]
}) {
  const range = dateRange ?? 'last_30_days'
  // D-10: the rows are fixed to the last 30 days (getUrlCitations' own window), so their
  // citation-share Δ against the previous period is only meaningful on "last 30 days" (D-8),
  // and every Δ is hidden under a model filter (FB-063). The prior fetch is skipped otherwise.
  const showDelta = !modelActive && range === 'last_30_days'
  const previous = showDelta ? deriveCompareRange(range, 'previous_period') : null

  const [citRes, citPriorRes, covRes] = await Promise.allSettled([
    getUrlCitations(clientSlug),
    previous ? getUrlCitations(clientSlug, previous) : Promise.resolve(null),
    // Prompt counts follow the picker range (spec: Known issues, D-10).
    getCoverageProjection(clientSlug, parseDateRange(range)),
  ])
  if (citRes.status === 'rejected') console.error('[competitor-gaps] URL citations error:', citRes.reason)
  if (citPriorRes.status === 'rejected') console.error('[competitor-gaps] URL citations prior error:', citPriorRes.reason)
  if (covRes.status === 'rejected') console.error('[competitor-gaps] coverage error:', covRes.reason)

  const coverage = covRes.status === 'fulfilled' ? covRes.value : null
  const brandAbsent = buildBrandAbsentRows({
    citations: citRes.status === 'fulfilled' ? citRes.value : [],
    citationsPrior: citPriorRes.status === 'fulfilled' ? citPriorRes.value : null,
    coverage: coverage ?? EMPTY_COVERAGE_PROJECTION,
    showDelta,
  })
  // D-15: the rows built here are all that reaches the client table. Clients get counts only;
  // prompt text is looked up (by id, server-side) for internal users alone.
  const rows = toCompetitorGapRows(brandAbsent, {
    audience,
    coverageOk: !!coverage?.complete,
    promptTextById: audience === 'internal' ? new Map(trackedPrompts.map((p) => [p.id, p.text])) : new Map(),
  })

  return (
    <CompetitorCard
      title={TITLE}
      description="Pages AI models cited in the last 30 days that mention a competitor but not you, with how many of your tracked prompts cite each one."
    >
      <CompetitorUrlsBrandAbsentTable rows={rows} emptyMessage="No competitor citation data available from Peec AI" />
    </CompetitorCard>
  )
}

export const competitorGapsV1: PartImpl<PeecCtx> = {
  id: 'competitor-gaps',
  version: 1,
  published: true,
  defaultLabel: TITLE,
  render: (ctx) => {
    // D-7: URL citations and coverage are Peec-only.
    if (!ctx.isPeec) return null
    return (
      <Suspense fallback={<CompetitorCardSkeleton title={TITLE} />}>
        <CompetitorGapsSection
          clientSlug={ctx.clientSlug}
          dateRange={ctx.dateRange}
          modelActive={ctx.modelActive}
          audience={ctx.audience}
          trackedPrompts={(ctx.data as PeecOverview).trackedPrompts}
        />
      </Suspense>
    )
  },
}
