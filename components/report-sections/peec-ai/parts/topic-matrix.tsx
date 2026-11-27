import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { TopicMatrixSection } from '../v2/topics-section'

/** AEO Overview v2, section 04: the client's and competitors' visibility by topic, or the client's by platform. The model
 *  filter is applied. A failure blanks only this card. */
export const topicMatrixV1: PartImpl<PeecCtx> = {
  id: 'topic-matrix',
  version: 1,
  published: true,
  defaultLabel: 'Visibility by topic',
  render: (ctx) => (
    <ReportErrorBoundary sectionName="the topic matrix">
      <Suspense fallback={<div className="h-72 animate-pulse rounded-lg bg-white/[0.03]" />}>
        <TopicMatrixSection
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
