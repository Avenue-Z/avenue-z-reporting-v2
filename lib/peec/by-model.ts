// lib/peec/by-model.ts
import type { AEOModel } from './models'

/** Maps an entity key (e.g. domain string) → per-model citation/visibility count. */
export type ByModel<K extends string = string, V = number> = Record<K, Partial<Record<AEOModel, V>>>

/** Sum the per-model values for a given key, restricted to the selected models.
 *  When `selected` is null, sums across all models. */
export function sumByModel<K extends string, V extends number>(
  byModel: ByModel<K, V>,
  key: K,
  selected: readonly AEOModel[] | null,
): number {
  const entry = byModel[key]
  if (!entry) return 0
  if (selected === null) {
    return Object.values(entry).reduce<number>((acc, v) => acc + (v ?? 0), 0)
  }
  return selected.reduce<number>((acc, m) => acc + (entry[m] ?? 0), 0)
}

/** Filter and recompute citation rows by selected AI models.
 *  Recomputes `citationCount` from per-model data, drops rows with 0 citations
 *  under the filter, and re-sorts descending by the new count.
 *  Delta fields (e.g. citationCountDelta) are intentionally NOT cleared — stale
 *  deltas are a known v1 limitation when a filter is active. Clearing them would
 *  require fetching prior-period per-model data which is not currently fetched. */
export function filterDomainRowsByModel<T extends { domain: string; citationCount: number }>(
  rows: T[],
  byModel: ByModel<string, number>,
  selected: AEOModel[] | null,
): T[] {
  if (!selected) return rows
  return rows
    .map((row) => ({ ...row, citationCount: sumByModel(byModel, row.domain, selected) }))
    .filter((row) => row.citationCount > 0)
    .sort((a, b) => b.citationCount - a.citationCount)
}

/** Average the per-model values for a given key, restricted to the selected models.
 *  Missing models are excluded from BOTH numerator and denominator — this returns the
 *  average over the models that actually have data among `selected`, not over
 *  `selected.length`. Callers that want zero-fill should use
 *  `sumByModel(...) / selected.length` directly. */
export function avgByModel<K extends string, V extends number>(
  byModel: ByModel<K, V>,
  key: K,
  selected: readonly AEOModel[] | null,
): number {
  const entry = byModel[key]
  if (!entry) return 0
  const models = selected ?? (Object.keys(entry) as AEOModel[])
  const vals = models.map((m) => entry[m]).filter((v): v is V => typeof v === 'number')
  if (vals.length === 0) return 0
  return vals.reduce<number>((a, b) => a + b, 0) / vals.length
}
