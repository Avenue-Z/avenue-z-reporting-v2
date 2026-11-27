import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { PromptPerformanceSection } from '../v2/topics-section'

/** AEO Overview v2, section 04: the client's rank and visibility on every tracked prompt, replacing Biggest Winners /
 *  Losers. The model filter is applied. A failure blanks only this card. */
export const promptPerformanceV1: PartImpl<PeecCtx> = {
  id: 'prompt-performance',
  version: 1,
  published: true,
  defaultLabel: 'Prompt Performance',
  render: (ctx) => (
    <ReportErrorBoundary sectionName="prompt performance">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}>
        <PromptPerformanceSection
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
