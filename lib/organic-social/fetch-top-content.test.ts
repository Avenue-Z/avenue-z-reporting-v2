import { expect, test } from 'vitest'
import { normalizePost } from './top-content'
import type { DashContentPost } from './content-types'

// Named fixture post (spec 2 §3.1): reactions 2 + post_clicks 1 → total_engagements 3,
// total_engagements_public 2. Dash's card displays 2 — we must read the *_public variant.
const fbPost: DashContentPost = {
  id: 699150694,
  source: 'FACEBOOK',
  type: 'IMAGE',
  source_created_at: '2026-06-30T11:02:00Z',
  media_group: null,
  facebook: {
    message: '#Ad Kids really do pick the worst timing',
    url: 'https://facebook.com/p/699150694',
    total_engagements: 3,
    total_engagements_public: 2,
    effectiveness: 41,
    engagement_rate_public: 0.012,
  },
}

test('Facebook engagements use total_engagements_public, not total_engagements', () => {
  const p = normalizePost(fbPost, 'FACEBOOK')
  expect(p.metrics.engagements).toBe(2) // NOT 3
})

test('normalizePost fills the stable normalized shape', () => {
  const p = normalizePost(fbPost, 'FACEBOOK')
  expect(p.id).toBe(699150694)
  expect(p.channel).toBe('FACEBOOK')
  expect(p.platform).toBe('Facebook')
  expect(p.publishedAt).toBe('2026-06-30')
  expect(p.mediaType).toBe('IMAGE')
  expect(p.sourceType).toBe('organic') // designation table overrides in S2-B
  expect(p.creative).toBeNull()        // resolveCreative is S2-C
  expect(p.url).toBe('https://facebook.com/p/699150694')
})

test('Instagram carousel keeps its CAROUSEL media type and single record', () => {
  const igCarousel: DashContentPost = {
    id: 1, source: 'INSTAGRAM', type: 'CAROUSEL', source_created_at: '2026-06-15T00:00:00Z',
    media_group: 42,
    instagram: { caption: 'swipe', url: 'https://instagram.com/p/1', total_engagements_public: 12, effectiveness: 30, engagement_rate_public: 0.05 },
  }
  const p = normalizePost(igCarousel, 'INSTAGRAM')
  expect(p.mediaType).toBe('CAROUSEL')
  expect(p.mediaGroup).toBe(42)
  expect(p.metrics.engagements).toBe(12)
})
