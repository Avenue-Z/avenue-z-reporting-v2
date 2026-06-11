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
