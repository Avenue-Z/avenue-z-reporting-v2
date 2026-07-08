// lib/profound/sentiment-normalize.ts
// FB-065: pure parsing + normalization for Profound sentiment responses.
// Dependency-free (no DB / network / framework imports) so it is unit testable
// in isolation. lib/profound/sentiment.ts composes these with the cached fetch.
//
// Model reactivity (Tina v1 flag: "doesn't change when a new model is
// selected") is handled HERE, client-side, by grouping the Profound query by
// `model` and aggregating only the selected models. We deliberately do NOT use
// Profound's server-side model filter: it keys on model UUIDs (not names) and
// silently no-ops on a malformed filter, which would ship wrong numbers. Client
// grouping is deterministic and auditable.

import type { AEOModel } from '@/lib/peec/models'

export type ProfoundSentimentTheme = {
  title: string       // display label (original casing of the most-cited variant)
  count: number       // occurrences backing this theme in its dominant polarity
  urls: string[]      // sources cited for this theme (from answer-level tags)
}

/** Subset of the Profound /v1/reports/sentiment response we rely on. */
export type SentimentResp = {
  info: { query?: { metrics?: string[] } }
  data: { metrics: number[]; dimensions: (string | null)[] }[]
}

/** Subset of the Profound /v1/prompts/answers response we rely on. Each answer
 *  is tagged by Profound with the themes it expresses, the citations it drew
 *  from, and the model that produced it. We join theme -> citations off this;
 *  no AI on our side. */
export type AnswersResp = {
  data: { themes?: (string | null)[] | null; citations?: (string | null)[] | null; model?: string | null }[]
}

/** Our AEOModel -> Profound's model display name. Profound only tracks these
 *  four for the Avenue Z account; Claude and Copilot have no Profound sentiment
 *  data, so selecting them yields an honest empty result rather than a fallback
 *  to all-models. Verified live via the `model` dimension. */
export const PROFOUND_MODEL_BY_AEO: Record<AEOModel, string | null> = {
  ChatGPT:    'ChatGPT',
  Perplexity: 'Perplexity',
  Gemini:     'Google Gemini',
  Google:     'Google AI Overviews',
  Claude:     null,
  Copilot:    null,
}

/** Resolve the active model filter to the set of Profound model names to keep.
 *  null  -> no filter (aggregate every model).
 *  Set   -> keep only these Profound model names. May be EMPTY when the only
 *           selected models are ones Profound does not track (Claude/Copilot),
 *           which correctly yields zero data instead of silently widening to all. */
export function selectedProfoundModels(models: AEOModel[] | null | undefined): Set<string> | null {
  if (!models || models.length === 0) return null
  const set = new Set<string>()
  for (const m of models) {
    const name = PROFOUND_MODEL_BY_AEO[m]
    if (name) set.add(name)
  }
  return set
}

/** Index of a metric within a response's metric ordering, or -1 if absent.
 *  Profound echoes the resolved metric order in info.query.metrics; rows align
 *  to it. Resolving by name makes parsing independent of that ordering. */
export function metricIndex(info: SentimentResp['info'], name: string): number {
  const metrics = info?.query?.metrics ?? []
  return metrics.indexOf(name)
}

/** Read a named metric off a row using the response's metric ordering.
 *  Returns 0 when the metric is absent or the value is not finite. */
export function readMetric(
  row: { metrics: number[] },
  info: SentimentResp['info'],
  name: string,
): number {
  const i = metricIndex(info, name)
  if (i < 0) return 0
  const v = row.metrics[i]
  return Number.isFinite(v) ? v : 0
}

/** Positive share of classified sentiment, 0-100. null when nothing is
 *  classified (positive + negative === 0), so the card can render "no data"
 *  rather than a misleading 0%. */
export function positiveShare(positive: number, negative: number): number | null {
  const total = positive + negative
  if (total <= 0) return null
  return (positive / total) * 100
}

/** Sum positive/negative over a model-grouped response (dimensions[0] = model),
 *  keeping only the selected Profound models (or all when `selected` is null). */
export function sumModelRows(
  resp: SentimentResp,
  selected: Set<string> | null,
): { positive: number; negative: number } {
  let positive = 0
  let negative = 0
  for (const row of resp.data) {
    const model = (row.dimensions?.[0] ?? '').trim()
    if (selected && !selected.has(model)) continue
    positive += readMetric(row, resp.info, 'positive')
    negative += readMetric(row, resp.info, 'negative')
  }
  return { positive, negative }
}

/** Collapse a [model, theme]-grouped response (dimensions = [model, theme])
 *  down to a theme-only response, summing positive/negative across the selected
 *  models per theme. The result carries the same info.query.metrics ordering so
 *  it can be fed straight into normalizeThemes. `occurrences`, if present, is
 *  recomputed as positive + negative. */
export function collapseModelThemeRows(
  resp: SentimentResp,
  selected: Set<string> | null,
): SentimentResp {
  const byTheme = new Map<string, { theme: string; positive: number; negative: number }>()
  for (const row of resp.data) {
    const model = (row.dimensions?.[0] ?? '').trim()
    if (selected && !selected.has(model)) continue
    const theme = (row.dimensions?.[1] ?? '').trim()
    if (!theme) continue
    const positive = readMetric(row, resp.info, 'positive')
    const negative = readMetric(row, resp.info, 'negative')
    const acc = byTheme.get(theme)
    if (!acc) byTheme.set(theme, { theme, positive, negative })
    else {
      acc.positive += positive
      acc.negative += negative
    }
  }
  const metricNames = resp.info?.query?.metrics ?? ['negative', 'occurrences', 'positive']
  const data = [...byTheme.values()].map((a) => ({
    dimensions: [a.theme],
    metrics: metricNames.map((m) =>
      m === 'positive' ? a.positive : m === 'negative' ? a.negative : a.positive + a.negative,
    ),
  }))
  return { info: resp.info, data }
}

/** Accumulator for the theme -> cited-source-URLs map. Kept separate from the
 *  URL de-dup set so pages of answers can be folded in incrementally (the
 *  answers dataset is large, so lib/profound/sentiment.ts paginates and calls
 *  accumulateThemeSources per page, never holding the whole set in memory). */
export type ThemeSourceState = {
  byKey: Map<string, string[]>
  seen: Map<string, Set<string>>
}

export function newThemeSourceState(): ThemeSourceState {
  return { byKey: new Map(), seen: new Map() }
}

/** Fold one page of answers into the theme -> sources accumulator.
 *
 *  Each Profound answer is tagged with the themes it expresses and the
 *  citations it drew from (plus its model). For every answer within the
 *  selected models, we attribute its citations to each of its themes. This is
 *  ANSWER-LEVEL attribution (an answer's citations apply to all themes that
 *  answer expresses), not surgical claim-level attribution, which Profound does
 *  not expose. Keys are lowercased theme labels so they line up with
 *  normalizeThemes' case-folding. URLs are de-duplicated (across all pages) and
 *  capped per theme. */
export function accumulateThemeSources(
  state: ThemeSourceState,
  resp: AnswersResp,
  selected: Set<string> | null,
  maxPerTheme = 12,
): void {
  for (const a of resp.data) {
    const model = (a.model ?? '').trim()
    if (selected && !selected.has(model)) continue
    const themes = a.themes ?? []
    const cites = (a.citations ?? []).filter((c): c is string => typeof c === 'string' && c.length > 0)
    if (themes.length === 0 || cites.length === 0) continue
    for (const t of themes) {
      const title = (t ?? '').trim()
      if (!title) continue
      const key = title.toLowerCase()
      let arr = state.byKey.get(key)
      if (!arr) { arr = []; state.byKey.set(key, arr) }
      let s = state.seen.get(key)
      if (!s) { s = new Set(); state.seen.set(key, s) }
      for (const c of cites) {
        if (arr.length >= maxPerTheme) break
        if (s.has(c)) continue
        s.add(c)
        arr.push(c)
      }
    }
  }
}

/** Single-shot theme -> sources map (one answers response). Thin wrapper over
 *  the accumulator, used where the whole set fits in one response / in tests. */
export function buildThemeSources(
  resp: AnswersResp,
  selected: Set<string> | null,
  maxPerTheme = 12,
): Map<string, string[]> {
  const state = newThemeSourceState()
  accumulateThemeSources(state, resp, selected, maxPerTheme)
  return state.byKey
}

/** Collapse per-theme rows into normalized Positive and Negative theme lists.
 *
 *  Profound returns thousands of theme rows, including case-variant duplicates
 *  ("Premium Pricing" vs "PREMIUM PRICING") and single-mention noise. We:
 *    1. fold rows by case-insensitive title, summing positive/negative counts
 *       and keeping the highest-occurrence original casing as the display label,
 *    2. classify each folded theme by dominant polarity (positive > negative
 *       -> positive list; negative > positive -> negative list; ties dropped as
 *       ambiguous),
 *    3. sort each list by its dominant-polarity count descending and cap to topN,
 *    4. attach cited-source URLs from `sourcesByKey` (keyed by lowercased title).
 */
export function normalizeThemes(
  resp: SentimentResp,
  topN = 8,
  sourcesByKey?: Map<string, string[]>,
): { positiveThemes: ProfoundSentimentTheme[]; negativeThemes: ProfoundSentimentTheme[] } {
  type Acc = { label: string; labelCount: number; positive: number; negative: number }
  const byKey = new Map<string, Acc>()

  for (const row of resp.data) {
    const title = (row.dimensions?.[0] ?? '').trim()
    if (!title) continue
    const key = title.toLowerCase()
    const positive = readMetric(row, resp.info, 'positive')
    const negative = readMetric(row, resp.info, 'negative')
    const occ = positive + negative

    const acc = byKey.get(key)
    if (!acc) {
      byKey.set(key, { label: title, labelCount: occ, positive, negative })
    } else {
      acc.positive += positive
      acc.negative += negative
      if (occ > acc.labelCount) {
        acc.label = title
        acc.labelCount = occ
      }
    }
  }

  const positiveThemes: ProfoundSentimentTheme[] = []
  const negativeThemes: ProfoundSentimentTheme[] = []
  for (const [key, acc] of byKey.entries()) {
    const urls = sourcesByKey?.get(key) ?? []
    if (acc.positive > acc.negative) {
      positiveThemes.push({ title: acc.label, count: acc.positive, urls })
    } else if (acc.negative > acc.positive) {
      negativeThemes.push({ title: acc.label, count: acc.negative, urls })
    }
    // exact ties (equal positive/negative) are ambiguous -> dropped
  }

  positiveThemes.sort((a, b) => b.count - a.count)
  negativeThemes.sort((a, b) => b.count - a.count)
  return {
    positiveThemes: positiveThemes.slice(0, topN),
    negativeThemes: negativeThemes.slice(0, topN),
  }
}
