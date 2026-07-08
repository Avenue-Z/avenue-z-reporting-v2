import { describe, expect, test } from 'vitest'
import { resolveCommentaryView, COMMENTARY_VIEWS } from './views'

describe('resolveCommentaryView', () => {
  test('AEO tabs', () => {
    expect(resolveCommentaryView('peec-ai')).toBe('peec-ai')
    expect(resolveCommentaryView('peec-ai', 'pr-influence')).toBe('peec-ai:pr-influence')
    expect(resolveCommentaryView('peec-ai', 'content-impact')).toBe('peec-ai:content-impact')
    expect(resolveCommentaryView('peec-ai', 'technical-audit')).toBeNull() // out of scope
  })
  test('paid search aliases collapse to one key', () => {
    expect(resolveCommentaryView('google-ads')).toBe('paid-search')       // deep-link route
    expect(resolveCommentaryView('paid-media')).toBe('paid-search')       // SPA route, no subsection
  })
  test('meta aliases collapse to one key', () => {
    expect(resolveCommentaryView('meta-ads')).toBe('meta-ads')            // deep-link + portal SPA
    expect(resolveCommentaryView('paid-media', 'meta')).toBe('meta-ads')  // dashboard SPA
  })
  test('linkedin aliases collapse to one key', () => {
    expect(resolveCommentaryView('linkedin-ads')).toBe('linkedin-ads')
    expect(resolveCommentaryView('paid-media', 'linkedin')).toBe('linkedin-ads')
  })
  test('organic social', () => {
    expect(resolveCommentaryView('organic-social')).toBe('organic-social')
  })
  test('out-of-scope tabs return null', () => {
    expect(resolveCommentaryView('ga4')).toBeNull()
    expect(resolveCommentaryView('exec-summary')).toBeNull()
    expect(resolveCommentaryView('paid-media', 'unknown')).toBeNull()
  })
  test('every canonical key has a registry entry', () => {
    const keys = ['peec-ai','peec-ai:pr-influence','peec-ai:content-impact','paid-search','meta-ads','linkedin-ads','organic-social'] as const
    for (const k of keys) expect(COMMENTARY_VIEWS[k]).toBeDefined()
  })
})
