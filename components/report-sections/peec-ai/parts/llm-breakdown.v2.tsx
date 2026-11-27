import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { ModelsSection } from '../v2/models-section'

/** AEO Overview v2, section 03: one gauge per AI model with a Visibility / Share of voice / Used as a source switch. The
 *  model filter is applied. A failure blanks only this card. */
export const llmBreakdownV2: PartImpl<PeecCtx> = {
  id: 'llm-breakdown',
  version: 2,
  published: true,
  defaultLabel: 'Performance by AI model',
  render: (ctx) => (
    <ReportErrorBoundary sectionName="performance by AI model">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}>
        <ModelsSection
          ctx={{
            provider: ctx.provider,
            clientSlug: ctx.clientSlug,
            dateRange: ctx.dateRange,
            compare: ctx.compare,
            showDeltas: ctx.showDeltas,
            models: ctx.models,
          }}
        />
      </Suspense>
    </ReportErrorBoundary>
  ),
}
