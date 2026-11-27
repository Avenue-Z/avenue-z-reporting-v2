import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { BrandTableV2Section } from '../v2/brand-table-section'

/** AEO Overview v2, section 02: the brand table with Used as a source % and the client pinned when outside the top 10.
 *  A failure blanks only this card. */
export const brandRankingsV2: PartImpl<PeecCtx> = {
  id: 'brand-rankings',
  version: 2,
  published: true,
  defaultLabel: 'Brand Rankings',
  render: (ctx) => (
    <ReportErrorBoundary sectionName="the brand table">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}>
        <BrandTableV2Section
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
