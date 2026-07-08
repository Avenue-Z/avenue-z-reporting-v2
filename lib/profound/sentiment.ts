// lib/profound/sentiment.ts
// FB-065: brand Sentiment Insights sourced from Profound's own API, replacing
// the in-house Glean call that guessed tone from article headlines.
//
// Tina's original ask + example (a Profound export) called for: a sentiment
// KPI pill, Positive/Negative themes side-by-side, and (positive side) the
// sources cited per theme. Profound is where that analysis actually lives, so
// we pull it instead of regenerating it. See memory
// project-sentiment-insights-profound-source for the full provenance.
//
// Endpoint: POST /v1/reports/sentiment
//   - Aggregate (no dimensions) -> period positive/negative/occurrences counts,
//     which give the pill % ( positive / (positive+negative) ).
//   - dimensions:['theme'] -> per-theme positive/negative/occurrences counts,
//     normalized (case-fold duplicate labels, classify by dominant polarity)
//     into the Positive/Negative theme lists.
// Metric literals are 'positive' | 'negative' | 'occurrences' (verified live;
// the *_sentiment names in the public docs are wrong for the v1 endpoint).
// Pure parsing/normalization lives in ./sentiment-normalize (unit tested).

import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { profoundPost, getCategoryId } from './client'
import {
  positiveShare,
  readMetric,
  normalizeThemes,
  type SentimentResp,
  type ProfoundSentimentTheme,
} from './sentiment-normalize'

export type { ProfoundSentimentTheme } from './sentiment-normalize'

export type ProfoundSentiment = {
  /** Share of classified mentions that are positive, 0-100. null when the
   *  period has no classified sentiment at all (no fake 0%). */
  positivePct: number | null
  /** Percentage-point change in positivePct vs the comparison period, or null
   *  when no comparison period is active / prior has no data. */
  positivePctDelta: number | null
  positiveThemes: ProfoundSentimentTheme[]
  negativeThemes: ProfoundSentimentTheme[]
  /** Total classified mentions in the period (positive + negative), for trust. */
  occurrences: number
}

function resolveAsset(): string {
  const asset = process.env.PROFOUND_AI_YOUR_BRAND ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  if (!asset) throw new Error('Missing env var: PROFOUND_AI_YOUR_BRAND (brand asset name for Profound sentiment)')
  return asset
}

/** One aggregate sentiment call for a date window -> { positive, negative }. */
async function fetchAggregate(
  categoryId: string,
  asset: string,
  startDate: string,
  endDate: string,
): Promise<{ positive: number; negative: number }> {
  const resp = (await profoundPost('/v1/reports/sentiment', {
    category_id: categoryId,
    asset,
    start_date: startDate,
    end_date: endDate,
    metrics: ['positive', 'negative', 'occurrences'],
  })) as SentimentResp
  const row = resp.data?.[0]
  if (!row) return { positive: 0, negative: 0 }
  return {
    positive: readMetric(row, resp.info, 'positive'),
    negative: readMetric(row, resp.info, 'negative'),
  }
}

async function getProfoundSentimentImpl(
  dateRange: string,
  compareRange: string | null,
): Promise<ProfoundSentiment> {
  const categoryId = await getCategoryId()
  const asset = resolveAsset()

  const main = parseDateRange(dateRange)
  const compare = compareRange ? deriveCompareRange(dateRange, compareRange) : null

  // Aggregate (pill) + theme breakdown for the main period, plus the prior
  // aggregate for the delta, in parallel.
  const [aggMain, themeResp, aggPrior] = await Promise.all([
    fetchAggregate(categoryId, asset, main.startDate, main.endDate),
    profoundPost('/v1/reports/sentiment', {
      category_id: categoryId,
      asset,
      start_date: main.startDate,
      end_date: main.endDate,
      dimensions: ['theme'],
      metrics: ['positive', 'negative', 'occurrences'],
      limit: 10000,
    }) as Promise<SentimentResp>,
    compare
      ? fetchAggregate(categoryId, asset, compare.startDate, compare.endDate)
      : Promise.resolve(null),
  ])

  const positivePct = positiveShare(aggMain.positive, aggMain.negative)
  const priorPct = aggPrior ? positiveShare(aggPrior.positive, aggPrior.negative) : null
  const positivePctDelta =
    positivePct !== null && priorPct !== null ? positivePct - priorPct : null

  const { positiveThemes, negativeThemes } = normalizeThemes(themeResp)

  return {
    positivePct,
    positivePctDelta,
    positiveThemes,
    negativeThemes,
    occurrences: aggMain.positive + aggMain.negative,
  }
}

/**
 * Cached entry point. Keyed on dateRange + compareRange; Profound sentiment is
 * a single-account (Avenue Z) feed today, so the account is fixed by env.
 * One-hour TTL, matching the other Profound reports.
 */
export const getProfoundSentiment = cached(
  'profound',
  'getProfoundSentiment',
  getProfoundSentimentImpl,
  {
    version: 'v1-profound-sentiment',
    ttlSeconds: 3600,
    extractTags: ([dateRange, compareRange]) => ({
      dateRange,
      compareRange: compareRange ?? 'none',
    }),
  },
)
