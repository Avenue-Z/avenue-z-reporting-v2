import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizePost, toTopContentRows } from './top-content'
import type { ContentResponse, DashContentPost, TopContentPost } from './content-types'

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
    impressions: 880,
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
  expect(p.metrics.impressions).toBe(880) // Views / Impressions column source
})

test('Instagram carousel keeps its CAROUSEL media type and single record', () => {
  const igCarousel: DashContentPost = {
    id: 1, source: 'INSTAGRAM', type: 'CAROUSEL', source_created_at: '2026-06-15T00:00:00Z',
    media_group: 42,
    instagram: { caption: 'swipe', url: 'https://instagram.com/p/1', engagements_public: 12, effectiveness: 30, engagement_rate_public: 0.05, impressions: 3400 },
  }
  const p = normalizePost(igCarousel, 'INSTAGRAM')
  expect(p.mediaType).toBe('CAROUSEL')
  expect(p.mediaGroup).toBe(42)
  expect(p.metrics.engagements).toBe(12)
  expect(p.metrics.impressions).toBe(3400)
})

// Per-channel engagement field regression (live probe, brand 26952): the field name differs
// per channel; a uniform `total_engagements_public` read silently zeroed IG/LI/X.
test('Instagram reads engagements_public, NOT total_engagements_public (the silent-zero bug)', () => {
  const ig: DashContentPost = {
    id: 5, source: 'INSTAGRAM', type: 'IMAGE',
    instagram: { caption: 'x', engagements_public: 10, total_engagements_public: 999 },
  }
  expect(normalizePost(ig, 'INSTAGRAM').metrics.engagements).toBe(10)
})

test('LinkedIn reads `engagements`; caption from caption, url from linkedin_link', () => {
  const li: DashContentPost = {
    id: 687024106, source: 'LINKEDIN', type: 'IMAGE', source_created_at: '2026-06-10T00:00:00Z',
    linkedin: { caption: 'li post', linkedin_link: 'https://linkedin.com/p/li', engagements: 483, engagement_rate: 0.66, impressions: 9100 },
  }
  const p = normalizePost(li, 'LINKEDIN')
  expect(p.platform).toBe('LinkedIn')
  expect(p.metrics.engagements).toBe(483)
  expect(p.metrics.impressions).toBe(9100)
  expect(p.metrics.engagementRate).toBe(0.66) // LinkedIn: plain engagement_rate, not *_public
  expect(p.caption).toBe('li post')
  expect(p.url).toBe('https://linkedin.com/p/li')
})

test('X reads `engagements`; caption from text, url from permalink_url', () => {
  const x: DashContentPost = {
    id: 662970035, source: 'TWITTER', type: 'IMAGE', source_created_at: '2026-06-05T00:00:00Z',
    twitter: { text: 'x post', permalink_url: 'https://x.com/p/x', engagements: 13, engagement_rate: 0.9, impressions: 540 },
  }
  const p = normalizePost(x, 'TWITTER')
  expect(p.platform).toBe('X')
  expect(p.metrics.engagements).toBe(13)
  expect(p.metrics.impressions).toBe(540)
  expect(p.metrics.engagementRate).toBe(0.9) // X: plain engagement_rate
  expect(p.caption).toBe('x post')
  expect(p.url).toBe('https://x.com/p/x')
})

test('normalizePost handles a UGC Instagram post from the captured fixture', () => {
  const fixture = JSON.parse(
    readFileSync('lib/organic-social/__fixtures__/content-instagram-ugc.json', 'utf8'),
  ) as ContentResponse
  const first = fixture.data.content[0]
  const p = normalizePost(first, 'INSTAGRAM')
  expect(p.channel).toBe('INSTAGRAM')
  expect(p.platform).toBe('Instagram')
  expect(p.id).toBe(first.id)
  // UGC engagement is keyed under the same field as owned Instagram (engagements_public)
  expect(p.metrics.engagements).toBeGreaterThan(0)
})

test('toTopContentRows maps normalized posts to the interim table rows', () => {
  const posts: TopContentPost[] = [
    { id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'a', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 10, engagementRate: 0.03, engagements: 50, impressions: 1200 }, sourceType: 'organic' },
  ]
  const rows = toTopContentRows(posts)
  expect(rows[0]).toMatchObject({ id: 1, platform: 'Instagram', engagements: 50, views: 1200, sourceType: 'organic', publishDate: '2026-06-01' })
})
