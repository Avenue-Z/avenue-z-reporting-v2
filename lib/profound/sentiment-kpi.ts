// lib/profound/sentiment-kpi.ts
// The Profound Sentiment tile on the v2 Snapshot KPI strip: the client brand's positive share of classified
// sentiment for one window, from Profound's v2 sentiment report. That report covers Sentiment-type prompts only,
// by construction, so no prompt-type filter is sent (spec section 7). The v1 report behind getProfoundSentiment
// (./sentiment.ts) answers 422 for any date from 2026-07-09 on, so this tile does not use it.
//
// Live shape (Avenue Z, 2026-10-26..2026-11-24, group_by []): one row,
//   { positive_sentiment: 77.09, negative_sentiment: 22.91 }   (already shares that sum to 100)
// and `data: []` for a window with no classified mentions. `occurrence` is refused (422) unless grouped by theme
// or claim, so the request asks for the two shares only. No model filter: the tile shows `--` under one.

import { cached } from '@/lib/cache'
import { profoundPost } from './client'
import { resolveProfoundConfig } from './sentiment'
import { positiveShare } from './sentiment-normalize'

type SentimentV2Row = { positive_sentiment?: number | null; negative_sentiment?: number | null }

const finite = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null)

async function getProfoundSentimentKpiImpl(clientSlug: string, isoRange: string): Promise<number | null> {
  const { categoryId, asset } = await resolveProfoundConfig(clientSlug)
  const [startDate, endDate] = isoRange.split(',')
  const resp = (await profoundPost('/v2/reports/sentiment', {
    category_id: categoryId,
    asset,
    start_date: startDate,
    end_date: endDate,
    group_by: [],
    metrics: ['positive_sentiment', 'negative_sentiment'],
  })) as unknown as { data?: SentimentV2Row[] }
  const row = resp.data?.[0]
  const positive = finite(row?.positive_sentiment)
  const negative = finite(row?.negative_sentiment)
  if (positive === null || negative === null) return null
  return positiveShare(positive, negative)
}

/** The brand's positive share of classified sentiment (0-100) for `isoRange` ('YYYY-MM-DD,YYYY-MM-DD'), or null
 *  when the window has no classified mentions. Rejects when Profound fails. One-hour TTL, keyed per client.
 *  Not health-critical: a failure only turns one KPI tile to `--` (the [aeo-kpis] log at the call site is the
 *  operational signal), so it must not mark the whole AEO page down, as for getWonStagesCompare in
 *  lib/salesforce/pipeline.ts. */
export const getProfoundSentimentKpi = cached('profound', 'getProfoundSentimentKpi', getProfoundSentimentKpiImpl, {
  version: 'v1-sentiment-v2-report',
  ttlSeconds: 3600,
  healthCritical: false,
  extractTags: ([clientSlug, isoRange]) => ({ client: clientSlug, dateRange: isoRange }),
})
