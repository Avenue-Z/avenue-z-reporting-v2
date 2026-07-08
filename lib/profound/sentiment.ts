// lib/profound/sentiment.ts
// FB-065: brand Sentiment Insights sourced from Profound's own API, replacing
// the in-house Glean call that guessed tone from article headlines.
//
// Tina's original ask + example (a Profound export) called for: a sentiment
// KPI pill, Positive/Negative themes side-by-side, and (positive side) the
// sources cited per theme. Profound is where that analysis actually lives, so
// we pull it instead of regenerating it. Tina's v1 flag was that the card was
// static ("doesn't change when a new date range or model is selected"): this
// fetch is reactive to BOTH the date range (start/end + comparison) AND the
// model picker. See memory project-sentiment-insights-profound-source.
//
// Endpoint: POST /v1/reports/sentiment
//   - group_by ['model']         -> per-model positive/negative -> pill % after
//                                    summing the selected models
//   - group_by ['model','theme'] -> per-(model,theme) counts -> collapse to the
//                                    selected models, then normalize to
//                                    Positive/Negative theme lists
// Metric literals are 'positive' | 'negative' | 'occurrences' (verified live;
// the *_sentiment names in the public docs are wrong for the v1 endpoint).
// Model scoping is done client-side (see sentiment-normalize) because
// Profound's server-side model filter keys on UUIDs and silently no-ops.

import { cached } from '@/lib/cache'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { AEOModel } from '@/lib/peec/models'
import { profoundPost, getCategoryId } from './client'
import {
  positiveShare,
  sumModelRows,
  collapseModelThemeRows,
  normalizeThemes,
  newThemeSourceState,
  accumulateThemeSources,
  selectedProfoundModels,
  type SentimentResp,
  type AnswersResp,
  type ProfoundSentimentTheme,
} from './sentiment-normalize'

// The answers endpoint (which carries per-theme citations) ignores top-level
// `limit` but honors `pagination.limit`/`offset`. The full set for a period is
// ~40MB, so instead of one giant parse we page through it, folding each page
// into the theme->sources accumulator and discarding the heavy `response` text
// as we go. This keeps memory bounded while giving COMPLETE per-theme source
// coverage (a bounded sample missed sources for lower-volume themes, especially
// under a model filter). PAGE is the per-request row count; MAX_PAGES caps the
// worst case so a runaway dataset can never loop forever.
const ANSWERS_PAGE = 5000
const ANSWERS_MAX_PAGES = 8

export type { ProfoundSentimentTheme } from './sentiment-normalize'

export type ProfoundSentiment = {
  /** Share of classified mentions that are positive, 0-100. null when the
   *  period/model selection has no classified sentiment (no fake 0%). */
  positivePct: number | null
  /** Percentage-point change in positivePct vs the comparison period, or null
   *  when no comparison period is active / prior has no data. */
  positivePctDelta: number | null
  positiveThemes: ProfoundSentimentTheme[]
  negativeThemes: ProfoundSentimentTheme[]
  /** Total classified mentions in the period/model selection, for trust. */
  occurrences: number
}

function resolveAsset(): string {
  const asset = process.env.PROFOUND_AI_YOUR_BRAND ?? process.env.PEEC_AI_YOUR_BRAND ?? ''
  if (!asset) throw new Error('Missing env var: PROFOUND_AI_YOUR_BRAND (brand asset name for Profound sentiment)')
  return asset
}

/** Stable cache-key fragment for the active model filter. Mirrors the Peec
 *  modelKeyOf: null/empty -> 'all', else sorted comma-joined. */
function modelKeyOf(models: AEOModel[] | null | undefined): string {
  if (!models || models.length === 0) return 'all'
  return [...models].sort().join(',')
}

/** One model-grouped sentiment call for a date window. */
async function fetchByModel(
  categoryId: string,
  asset: string,
  startDate: string,
  endDate: string,
): Promise<SentimentResp> {
  return (await profoundPost('/v1/reports/sentiment', {
    category_id: categoryId,
    asset,
    start_date: startDate,
    end_date: endDate,
    dimensions: ['model'],
    metrics: ['positive', 'negative', 'occurrences'],
    limit: 50,
  })) as SentimentResp
}

/** Build the theme -> cited-sources map for a period by paging through ALL of
 *  the period's answers (each tagged with themes + citations + model), folding
 *  each page into the accumulator filtered to the selected models. Best-effort:
 *  on any failure we return whatever was accumulated so far (possibly empty) so
 *  the pill + themes still render rather than breaking the card. */
async function buildSourcesMap(
  categoryId: string,
  asset: string,
  startDate: string,
  endDate: string,
  selected: Set<string> | null,
): Promise<Map<string, string[]>> {
  const state = newThemeSourceState()
  try {
    for (let page = 0; page < ANSWERS_MAX_PAGES; page++) {
      const resp = (await profoundPost('/v1/prompts/answers', {
        category_id: categoryId,
        asset,
        start_date: startDate,
        end_date: endDate,
        include: { sentiment_claims: true },
        pagination: { limit: ANSWERS_PAGE, offset: page * ANSWERS_PAGE },
      })) as unknown as AnswersResp
      const rows = resp?.data ?? []
      accumulateThemeSources(state, { data: rows }, selected)
      if (rows.length < ANSWERS_PAGE) break // last page reached
    }
  } catch (e) {
    console.error('[profound] sentiment answers paging failed (themes render with partial/no sources):', e)
  }
  return state.byKey
}

async function getProfoundSentimentImpl(
  dateRange: string,
  compareRange: string | null,
  models: AEOModel[] | null,
): Promise<ProfoundSentiment> {
  const categoryId = await getCategoryId()
  const asset = resolveAsset()
  const selected = selectedProfoundModels(models)

  const main = parseDateRange(dateRange)
  const compare = compareRange ? deriveCompareRange(dateRange, compareRange) : null

  const [pillMainResp, themeResp, pillPriorResp, themeSources] = await Promise.all([
    fetchByModel(categoryId, asset, main.startDate, main.endDate),
    profoundPost('/v1/reports/sentiment', {
      category_id: categoryId,
      asset,
      start_date: main.startDate,
      end_date: main.endDate,
      dimensions: ['model', 'theme'],
      metrics: ['positive', 'negative', 'occurrences'],
      limit: 10000,
    }) as Promise<SentimentResp>,
    compare
      ? fetchByModel(categoryId, asset, compare.startDate, compare.endDate)
      : Promise.resolve(null),
    // Theme -> cited sources, model-filtered to match the pill/themes selection.
    buildSourcesMap(categoryId, asset, main.startDate, main.endDate, selected),
  ])

  const mainCounts = sumModelRows(pillMainResp, selected)
  const positivePct = positiveShare(mainCounts.positive, mainCounts.negative)

  const priorCounts = pillPriorResp ? sumModelRows(pillPriorResp, selected) : null
  const priorPct = priorCounts ? positiveShare(priorCounts.positive, priorCounts.negative) : null
  const positivePctDelta =
    positivePct !== null && priorPct !== null ? positivePct - priorPct : null

  const { positiveThemes, negativeThemes } = normalizeThemes(
    collapseModelThemeRows(themeResp, selected),
    8,
    themeSources,
  )

  return {
    positivePct,
    positivePctDelta,
    positiveThemes,
    negativeThemes,
    occurrences: mainCounts.positive + mainCounts.negative,
  }
}

/**
 * Cached entry point. Keyed on dateRange + compareRange + the selected-model
 * key, so the pill and themes are cached per (period, model selection) exactly
 * like the rest of the AEO tab. Profound sentiment is a single-account (Avenue
 * Z) feed today, so the account is fixed by env. One-hour TTL.
 */
export const getProfoundSentiment = cached(
  'profound',
  'getProfoundSentiment',
  getProfoundSentimentImpl,
  {
    version: 'v1-profound-sentiment',
    ttlSeconds: 3600,
    extractTags: ([dateRange, compareRange, models]) => ({
      dateRange,
      compareRange: compareRange ?? 'none',
      models: modelKeyOf(models),
    }),
  },
)
