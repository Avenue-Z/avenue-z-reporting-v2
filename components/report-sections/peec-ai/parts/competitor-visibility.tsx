import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import type { PeecOverview } from '@/lib/peec/client'
import type { AEOModel } from '@/lib/peec/models'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getCoverageProjection, EMPTY_COVERAGE_PROJECTION, type CoverageProjection } from '@/lib/peec/coverage-projection'
import { buildCompetitorDomainRows } from '@/lib/peec/competitor-tables'
import { CompetitorDomainsCitedTable } from '../competitor-tables'
import { CompetitorCard, CompetitorCardSkeleton } from './competitor-card'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'

// Spec copy, verbatim. Rendered as-is rather than from resolved.label, which falls back to the
// part id when the section_templates row carries no label for it.
const TITLE = 'Competitor visibility'

/** H1 (moved from Content Impact): competitor domains by Source Visibility, Citation Share and Prompt Coverage. */
export async function CompetitorVisibilitySection({
  clientSlug,
  dateRange,
  data,
  models,
}: {
  clientSlug: string | undefined
  dateRange: string | undefined
  data: PeecOverview
  models: AEOModel[] | null
}) {
  const range = dateRange ?? 'last_30_days'
  const current = parseDateRange(range)
  // D-8: Overview always compares to the previous period. Deltas are hidden under a model
  // filter (FB-063, in the builder), so the prior walk is skipped then.
  const modelFilterActive = models != null && models.length > 0
  const previous = modelFilterActive ? null : deriveCompareRange(range, 'previous_period')

  const [covRes, covPriorRes] = await Promise.allSettled([
    getCoverageProjection(clientSlug, current),
    previous ? getCoverageProjection(clientSlug, previous) : Promise.resolve(null),
  ])
  if (covRes.status === 'rejected') console.error('[competitor-visibility] coverage error:', covRes.reason)
  if (covPriorRes.status === 'rejected') console.error('[competitor-visibility] coverage prior error:', covPriorRes.reason)
  // A failed or incomplete walk renders Prompt Coverage as --, not a short count (D-17, D-21).
  const usable = (r: PromiseSettledResult<CoverageProjection | null>) =>
    r.status === 'fulfilled' && r.value?.complete ? r.value : null

  const rows = buildCompetitorDomainRows({
    competitorDomains: data.topDomains.filter((d) => d.type === 'Competitor'),
    domainCitationsByModel: data.domainCitationsByModel,
    coverage: usable(covRes) ?? EMPTY_COVERAGE_PROJECTION,
    coveragePrior: usable(covPriorRes),
    totalTrackedPrompts: data.trackedPrompts.length,
    models,
    showDeltas: true,
  })

  return (
    <CompetitorCard
      title={TITLE}
      description="See which competitor domains are gaining or losing ground across Source Visibility, Citation Share, and Prompt Coverage for your target prompts, compared with the previous period."
    >
      <CompetitorDomainsCitedTable rows={rows} emptyMessage="No competitor domain data available from Peec AI" />
    </CompetitorCard>
  )
}

export const competitorVisibilityV1: PartImpl<PeecCtx> = {
  id: 'competitor-visibility',
  version: 1,
  published: true,
  defaultLabel: TITLE,
  render: (ctx) => {
    // D-7: URL citations and coverage are Peec-only.
    if (!ctx.isPeec) return null
    return (
      <Suspense fallback={<CompetitorCardSkeleton title={TITLE} />}>
        {/* A failure blanks only this card; the rest of the Overview still renders. */}
        <ReportErrorBoundary sectionName={TITLE}>
          <CompetitorVisibilitySection
            clientSlug={ctx.clientSlug}
            dateRange={ctx.dateRange}
            data={ctx.data as PeecOverview}
            models={ctx.models}
          />
        </ReportErrorBoundary>
      </Suspense>
    )
  },
}
