import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { VisibilityV2Section } from '../v2/visibility-v2-section'

/** AEO Overview v2, section 02: per-brand year-to-date visibility trend. The card has no title of its own: section 02's
 *  headline ("How has AI visibility grown this year?") is its title. A failure blanks only this card. */
export const visibilityChartV2: PartImpl<PeecCtx> = {
  id: 'visibility-chart',
  version: 2,
  published: true,
  defaultLabel: 'Visibility trend',
  render: (ctx) => (
    <ReportErrorBoundary sectionName="the visibility trend">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}>
        <VisibilityV2Section
          ctx={{
            provider: ctx.provider,
            clientSlug: ctx.clientSlug,
            dateRange: ctx.dateRange,
            compare: ctx.compare,
            showDeltas: ctx.showDeltas,
            modelActive: ctx.modelActive,
          }}
        />
      </Suspense>
    </ReportErrorBoundary>
  ),
}
