import type { AEOModel } from '@/lib/peec/models'

/** A Profound model name as an AEO model, or null for one the app does not show. Unlike v1's normalizeModel, Google AI
 *  Overviews stays apart from Gemini. */
export function profoundModel(name: string): AEOModel | null {
  const n = name.trim().toLowerCase()
  if (n === 'chatgpt') return 'ChatGPT'
  if (n === 'google ai overviews') return 'Google'
  if (n === 'google gemini' || n === 'gemini') return 'Gemini'
  if (n.includes('perplexity')) return 'Perplexity'
  if (n.includes('claude')) return 'Claude'
  if (n.includes('copilot')) return 'Copilot'
  return null
}
