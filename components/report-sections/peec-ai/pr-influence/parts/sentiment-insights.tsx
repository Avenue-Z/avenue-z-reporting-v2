import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { SentimentInsightsSection, SentimentSkeleton } from '../../sentiment-insights-section'
import type { PrInfluenceCtx } from '../ctx'

export const sentimentInsightsV1: PartImpl<PrInfluenceCtx> = {
  id: 'sentiment-insights', version: 1, published: true, defaultLabel: 'Sentiment Insights',
  // Profound is a single-account feed. Render only for Avenue Z; null otherwise
  // (so no client without a Profound account ever shows it). Preserves the
  // pre-migration slug gate exactly.
  render: (ctx) => {
    if (ctx.clientSlug !== 'avenue-z') return null
    return (
      <Suspense fallback={<SentimentSkeleton />}>
        <SentimentInsightsSection dateRange={ctx.dateRange} models={ctx.models} />
      </Suspense>
    )
  },
}
