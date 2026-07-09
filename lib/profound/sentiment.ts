// lib/profound/sentiment.ts
// FB-065: brand Sentiment Insights sourced from Profound's own API, replacing
// the in-house Glean call that guessed tone from article headlines.
//
// Tina's original ask + example (a Profound export) called for: a sentiment
// KPI pill, Positive/Negative themes side-by-side, and (positive side) the
// sources cited per theme. Profound is where that analysis actually lives, so
// we pull it instead of regenerating it. Tina's v1 flag was that the card was
// static ("doesn't change when a new date range or model is selected"): this
// fetch is reactive to the date range (start/end) AND the model picker. The
// card renders the current period only, pill and themes with no prior-period
// comparison: the only caller passes compareRange=null and the UI never
// renders a delta, so there is no comparison-period path here.
// See memory project-sentiment-insights-profound-source.
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
import { parseDateRange } from '@/lib/ga4/client'
import { modelKeyOf, type AEOModel } from '@/lib/peec/models'
import { profoundPost, getCategoryId } from './client'
import {
  positiveShare,
  sumModelRows,
  collapseModelThemeRows,
  normalizeThemes,
  newThemeSourceState,
  accumulateThemeSources,
  finalizeThemeSources,
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

/** Pagination stop condition for the answers loop below (#138 P3). Profound
 *  can cap a page's row count below the requested `pagination.limit`, so a
 *  page shorter than ANSWERS_PAGE does NOT mean the last page: only a page
 *  with zero rows does. Stopping on "short" truncated sources to page 1
 *  whenever Profound's cap was below ANSWERS_PAGE. */
export function shouldStopAnswerPaging(rows: unknown[]): boolean {
  return rows.length === 0
}

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
      const resp = (await profoundPost(
        '/v1/prompts/answers',
        {
          category_id: categoryId,
          asset,
          start_date: startDate,
          end_date: endDate,
          include: { sentiment_claims: true },
          pagination: { limit: ANSWERS_PAGE, offset: page * ANSWERS_PAGE },
        },
        // #138 P9: skip the inert fetch-layer cache. The final theme->sources
        // map is what getProfoundSentiment's outer cached() wrapper persists;
        // this raw per-page answers payload is too large for Next's 2MB
        // data-cache entry limit, so revalidate here never actually caches.
        { revalidate: false },
      )) as unknown as AnswersResp
      const rows = resp?.data ?? []
      accumulateThemeSources(state, { data: rows }, selected)
      if (shouldStopAnswerPaging(rows)) break // last page reached (zero rows)
    }
  } catch (e) {
    console.error('[profound] sentiment answers paging failed (themes render with partial/no sources):', e)
  }
  // Rank each theme's URLs by citation frequency and cap to the top 12. Runs
  // over whatever was accumulated, so a mid-paging failure still yields the
  // best-ranked sources from the pages that succeeded.
  return finalizeThemeSources(state)
}

async function getProfoundSentimentImpl(
  dateRange: string,
  // Accepted for call-site/cache-key compatibility only: the card is
  // pill-only for the current period (#138 P10), so this is never read.
  // The only caller (SentimentInsightsSection) always passes null, and the
  // UI never renders a delta.
  _compareRange: string | null,
  models: AEOModel[] | null,
): Promise<ProfoundSentiment> {
  const categoryId = await getCategoryId()
  const asset = resolveAsset()
  const selected = selectedProfoundModels(models)

  const main = parseDateRange(dateRange)

  const [pillMainResp, themeResp, themeSources] = await Promise.all([
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
    // Theme -> cited sources, model-filtered to match the pill/themes selection.
    buildSourcesMap(categoryId, asset, main.startDate, main.endDate, selected),
  ])

  const mainCounts = sumModelRows(pillMainResp, selected)
  const positivePct = positiveShare(mainCounts.positive, mainCounts.negative)

  const { positiveThemes, negativeThemes } = normalizeThemes(
    collapseModelThemeRows(themeResp, selected),
    8,
    themeSources,
  )

  return {
    positivePct,
    // No prior-period comparison for this card (see param comment above).
    positivePctDelta: null,
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
 *
 * IMPORTANT: bump `version` whenever anything downstream of the cache changes
 * shape or logic (fetch params, filter rules, response mapping). The cache
 * key is (vendor, fn, version, today, ...args); missing a bump serves stale
 * results across deploys under the same key. v1 -> v2 landed alongside the
 * paginated /v1/prompts/answers fetch that replaced the bounded 2000-sample.
 */
export const getProfoundSentiment = cached(
  'profound',
  'getProfoundSentiment',
  getProfoundSentimentImpl,
  {
    version: 'v2-profound-sentiment-paged',
    ttlSeconds: 3600,
    extractTags: ([dateRange, compareRange, models]) => ({
      dateRange,
      compareRange: compareRange ?? 'none',
      models: modelKeyOf(models),
    }),
  },
)
