// lib/peec/models.ts
/** Canonical AI model identifiers — used for filtering, color coding, and URL params. */
export const AEO_MODELS = ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Copilot', 'Google'] as const

export type AEOModel = (typeof AEO_MODELS)[number]

export const MODEL_COLORS: Record<AEOModel, string> = {
  ChatGPT:    '#10A37F',
  Perplexity: '#26C7C8',
  Gemini:     '#4285F4',
  Claude:     '#CC785C',
  Copilot:    '#0078D4',
  Google:     '#34A853',
}

/** User-facing display labels. Canonical ids stay in `AEO_MODELS` (used for URL
 *  params, color keys, filter logic) but rendered labels go through this map so
 *  ambiguous names can be disambiguated without ripple effects elsewhere.
 *  FB-005: `Google` bucket contains Peec's `google-ai-overview-scraper` rows. */
export const MODEL_DISPLAY_LABELS: Record<AEOModel, string> = {
  ChatGPT:    'ChatGPT',
  Perplexity: 'Perplexity',
  Gemini:     'Gemini',
  Claude:     'Claude',
  Copilot:    'Copilot',
  Google:     'Google AI Overview',
}

/** Parse `?models=ChatGPT,Gemini` → canonical subset. Returns null when no filter is active
 *  (param missing, empty, all-invalid, or contains all 6 — all treated as "no filter").
 *  Case-sensitive: assumes the param is always written by `serializeModelsParam`, so casing
 *  is canonical. Wrong-case input silently drops to null. */
export function parseModelsParam(raw: string | null | undefined): AEOModel[] | null {
  if (!raw) return null
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter((p): p is AEOModel => (AEO_MODELS as readonly string[]).includes(p))
  const unique = Array.from(new Set(valid))
  if (unique.length === 0) return null
  if (unique.length === AEO_MODELS.length) return null
  return unique
}

/** Serialize a subset back to URL form. Returns null when no filter should be written. */
export function serializeModelsParam(selected: AEOModel[]): string | null {
  const unique = Array.from(new Set(selected))
  if (unique.length === 0) return null
  if (unique.length === AEO_MODELS.length) return null
  return AEO_MODELS.filter((m) => unique.includes(m)).join(',')
}

/** Returns true when no filter is active (all models effectively selected). */
export function isAllModels(selected: AEOModel[] | null): boolean {
  return selected === null || selected.length === 0 || selected.length === AEO_MODELS.length
}

/** Stable cache-key fragment for a model filter, order-independent: null/empty
 *  -> 'all', else sorted comma-joined. Shared by every vendor cache wrapper
 *  that keys on the active model selection (Peec, Profound), so a caller
 *  filtering to `['Gemini', 'ChatGPT']` and one filtering to `['ChatGPT',
 *  'Gemini']` land on the same cache entry. */
export function modelKeyOf(models: AEOModel[] | null | undefined): string {
  if (!models || models.length === 0) return 'all'
  return [...models].sort().join(',')
}
