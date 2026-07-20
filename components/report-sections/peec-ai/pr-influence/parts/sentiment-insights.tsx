import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { SentimentInsightsSection, SentimentSkeleton } from '../../sentiment-insights-section'
import type { PrInfluenceCtx } from '../ctx'

export const sentimentInsightsV1: PartImpl<PrInfluenceCtx> = {
  id: 'sentiment-insights', version: 1, published: true, defaultLabel: 'Sentiment Insights',
  // Profound is a single-account feed. Gate on the client row's profoundCategoryId
  // (#138 P6: ctx.profoundConfigured), not a hardcoded slug, so no client without a
  // Profound account ever shows it and a future second Profound client renders it
  // without a code change. clientSlug is threaded so brand/category resolve per
  // client and the sentiment cache key carries a client dimension (#138 P7).
  render: (ctx) => {
    if (!ctx.profoundConfigured) return null
    return (
      <Suspense fallback={<SentimentSkeleton />}>
        <SentimentInsightsSection clientSlug={ctx.clientSlug} dateRange={ctx.dateRange} models={ctx.models} />
      </Suspense>
    )
  },
}
