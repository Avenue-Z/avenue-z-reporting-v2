/** Client line plus up to seven competitor lines: eight lines in all. */
export const MAX_COMPETITOR_LINES = 7

export const TREND_PARAM = 'aeoTrend'

const DEFAULT_COMPETITOR_LINES = 4

export type TrendSelection = { competitors: boolean; selected: string[] }

export function defaultTrendSelection(competitorKeysByVisibility: readonly string[]): TrendSelection {
  return { competitors: true, selected: competitorKeysByVisibility.slice(0, DEFAULT_COMPETITOR_LINES) }
}

/**
 * Reads the `aeoTrend` URL param. Missing or empty gives the default; `off` turns competitors off.
 * Otherwise keeps known keys in param order, drops duplicates, and caps at seven. Nothing known
 * left gives the default.
 */
export function parseTrendParam(
  raw: string | null | undefined,
  competitorKeysByVisibility: readonly string[],
): TrendSelection {
  if (!raw) return defaultTrendSelection(competitorKeysByVisibility)
  if (raw === 'off') return { competitors: false, selected: [] }
  const known = new Set(competitorKeysByVisibility)
  const selected: string[] = []
  for (const key of raw.split(',')) {
    if (known.has(key) && !selected.includes(key)) selected.push(key)
    if (selected.length === MAX_COMPETITOR_LINES) break
  }
  if (selected.length === 0) return defaultTrendSelection(competitorKeysByVisibility)
  return { competitors: true, selected }
}

/**
 * Writes the selection back to the param. `null` means delete the param (the selection is the
 * default), `off` means competitors are off, and anything else is the keys joined by commas.
 */
export function serializeTrend(sel: TrendSelection, competitorKeysByVisibility: readonly string[]): string | null {
  if (!sel.competitors) return 'off'
  const def = defaultTrendSelection(competitorKeysByVisibility)
  const isDefault = sel.selected.length === def.selected.length && sel.selected.every((key, i) => key === def.selected[i])
  if (isDefault) return null
  return sel.selected.join(',')
}
