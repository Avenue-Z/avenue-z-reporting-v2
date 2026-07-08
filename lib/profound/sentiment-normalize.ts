// lib/profound/sentiment-normalize.ts
// FB-065: pure parsing + normalization for Profound sentiment responses.
// Kept dependency-free (no DB / network / framework imports) so it is unit
// testable in isolation. lib/profound/sentiment.ts composes these with the
// cached network fetch.

export type ProfoundSentimentTheme = {
  title: string       // display label (original casing of the most-cited variant)
  count: number       // occurrences backing this theme in its dominant polarity
}

/** Subset of the Profound /v1/reports/sentiment response we rely on. */
export type SentimentResp = {
  info: { query?: { metrics?: string[] } }
  data: { metrics: number[]; dimensions: (string | null)[] }[]
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

/** Collapse per-theme rows into normalized Positive and Negative theme lists.
 *
 *  Profound returns thousands of theme rows, including case-variant duplicates
 *  ("Premium Pricing" vs "PREMIUM PRICING") and single-mention noise. We:
 *    1. fold rows by case-insensitive title, summing positive/negative counts
 *       and keeping the highest-occurrence original casing as the display label,
 *    2. classify each folded theme by dominant polarity (positive > negative
 *       -> positive list; negative > positive -> negative list; ties dropped as
 *       ambiguous),
 *    3. sort each list by its dominant-polarity count descending and cap to topN.
 */
export function normalizeThemes(
  resp: SentimentResp,
  topN = 8,
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
      // keep the casing of the highest-occurrence variant as the display label
      if (occ > acc.labelCount) {
        acc.label = title
        acc.labelCount = occ
      }
    }
  }

  const positiveThemes: ProfoundSentimentTheme[] = []
  const negativeThemes: ProfoundSentimentTheme[] = []
  for (const acc of byKey.values()) {
    if (acc.positive > acc.negative) {
      positiveThemes.push({ title: acc.label, count: acc.positive })
    } else if (acc.negative > acc.positive) {
      negativeThemes.push({ title: acc.label, count: acc.negative })
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
