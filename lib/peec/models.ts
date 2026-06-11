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

/** Parse `?models=ChatGPT,Gemini` → canonical subset. Returns null when no filter is active
 *  (param missing, empty, or contains all 6 — treat all of those as "no filter"). */
export function parseModelsParam(raw: string | null | undefined): AEOModel[] | null {
  if (!raw) return null
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter((p): p is AEOModel => (AEO_MODELS as readonly string[]).includes(p))
  if (valid.length === 0) return null
  if (valid.length === AEO_MODELS.length) return null
  return Array.from(new Set(valid))
}

/** Serialize a subset back to URL form. Returns null when no filter should be written. */
export function serializeModelsParam(selected: AEOModel[]): string | null {
  if (selected.length === 0) return null
  if (selected.length === AEO_MODELS.length) return null
  const ordered = AEO_MODELS.filter((m) => selected.includes(m))
  return ordered.join(',')
}

/** Returns true when no filter is active (all models effectively selected). */
export function isAllModels(selected: AEOModel[] | null): boolean {
  return selected === null || selected.length === 0 || selected.length === AEO_MODELS.length
}
