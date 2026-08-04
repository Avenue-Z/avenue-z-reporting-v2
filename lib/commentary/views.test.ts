import { describe, expect, test } from 'vitest'
import { resolveCommentaryView, COMMENTARY_VIEWS, isCommentaryViewKey, orgSocialChannelViewKey } from './views'
import { CHANNELS } from '@/lib/organic-social/metrics'

describe('isCommentaryViewKey', () => {
  test('accepts the 7 canonical keys', () => {
    for (const k of Object.keys(COMMENTARY_VIEWS)) expect(isCommentaryViewKey(k)).toBe(true)
  })
  test('rejects non-canonical keys', () => {
    for (const k of ['ga4', 'exec-summary', 'peec-ai:technical-audit', 'paid-media', '', 'commentary']) {
      expect(isCommentaryViewKey(k)).toBe(false)
    }
  })
})

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

describe('organic social per-channel commentary keys', () => {
  test('orgSocialChannelViewKey lowercases the Dash channel', () => {
    expect(orgSocialChannelViewKey('INSTAGRAM')).toBe('organic-social:instagram')
    expect(orgSocialChannelViewKey('FACEBOOK')).toBe('organic-social:facebook')
    expect(orgSocialChannelViewKey('TWITTER')).toBe('organic-social:twitter')
    expect(orgSocialChannelViewKey('LINKEDIN')).toBe('organic-social:linkedin')
  })
  test('every channel has a registry entry the guard accepts', () => {
    for (const c of CHANNELS) {
      const k = orgSocialChannelViewKey(c)
      expect(COMMENTARY_VIEWS[k]).toBeDefined()
      expect(isCommentaryViewKey(k)).toBe(true)
    }
  })
  test('channel labels use the Dash display name (X for Twitter)', () => {
    expect(COMMENTARY_VIEWS[orgSocialChannelViewKey('INSTAGRAM')].label).toBe('Organic Social — Instagram')
    expect(COMMENTARY_VIEWS[orgSocialChannelViewKey('TWITTER')].label).toBe('Organic Social — X')
  })
})
