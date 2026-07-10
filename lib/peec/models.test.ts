import { describe, it, expect } from 'vitest'
import { modelKeyOf } from './models'
import type { AEOModel } from './models'

// #138 P8: modelKeyOf moved here from lib/profound/sentiment.ts (shared cache-key
// helper). These assertions pin the exact prior behavior so cache keys do not
// shift for existing entries: null/empty -> 'all', otherwise sorted + comma-joined.
describe('modelKeyOf', () => {
  it('returns "all" for null, undefined, or an empty array', () => {
    expect(modelKeyOf(null)).toBe('all')
    expect(modelKeyOf(undefined)).toBe('all')
    expect(modelKeyOf([])).toBe('all')
  })

  it('sorts models before joining, independent of input order', () => {
    expect(modelKeyOf(['Gemini', 'ChatGPT'])).toBe('ChatGPT,Gemini')
    expect(modelKeyOf(['ChatGPT', 'Gemini'])).toBe('ChatGPT,Gemini')
  })

  it('produces a stable key for the same set regardless of order (cache-key parity)', () => {
    const a = modelKeyOf(['Perplexity', 'Claude', 'ChatGPT'])
    const b = modelKeyOf(['ChatGPT', 'Perplexity', 'Claude'])
    const c = modelKeyOf(['Claude', 'ChatGPT', 'Perplexity'])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a).toBe('ChatGPT,Claude,Perplexity')
  })

  it('joins a single model with no trailing separator', () => {
    expect(modelKeyOf(['Copilot'])).toBe('Copilot')
  })

  it('does not mutate the input array', () => {
    const input: AEOModel[] = ['Gemini', 'ChatGPT']
    modelKeyOf(input)
    expect(input).toEqual(['Gemini', 'ChatGPT'])
  })
})
