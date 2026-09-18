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
    effectiveness: 41,              // old field — must NOT be used
    engagement_rate_public: 0.012,  // old field — must NOT be used
    organic_effectiveness_v2: 0.15,
    organic_engagement_rate_v2: 0.08,
    impressions: 0,          // organic FB always returns 0 here (the bug); real exposure below
    organic_views: 880,      // Views / Impressions column source (CONTENT_IMPRESSIONS_FIELD.FACEBOOK)
  },
}

test('Facebook engagements use total_engagements_public, not total_engagements', () => {
  const p = normalizePost(fbPost, 'FACEBOOK')
  expect(p.metrics.engagements).toBe(2) // NOT 3
})

test('Facebook rate/effectiveness read the organic *_v2 family (matches Dash), not *_public/effectiveness', () => {
  const p = normalizePost(fbPost, 'FACEBOOK')
  expect(p.metrics.engagementRate).toBe(0.08)  // organic_engagement_rate_v2, NOT engagement_rate_public 0.012
  expect(p.metrics.effectiveness).toBe(0.15)   // organic_effectiveness_v2, NOT effectiveness 41
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
    instagram: { caption: 'swipe', url: 'https://instagram.com/p/1', sum_total_engagements: 12, effectiveness_engagements: 0.3, engagement: 0.05, impressions: 0, views: 3400 },
  }
  const p = normalizePost(igCarousel, 'INSTAGRAM')
  expect(p.mediaType).toBe('CAROUSEL')
  expect(p.mediaGroup).toBe(42)
  expect(p.metrics.engagements).toBe(12)
  expect(p.metrics.impressions).toBe(3400)
})

// Instagram metric fields reconciled against Dash's per-post "Organic" numbers (2026-07-28):
// engagements = sum_total_engagements (INCLUDES reposts), rate = `engagement`, effectiveness =
// effectiveness_engagements. The *_public variants exclude reposts and undercount.
test('Instagram engagements read sum_total_engagements (incl. reposts), not engagements_public', () => {
  const ig: DashContentPost = {
    id: 5, source: 'INSTAGRAM', type: 'IMAGE',
    instagram: { caption: 'x', sum_total_engagements: 4, engagements_public: 3 },
  }
  expect(normalizePost(ig, 'INSTAGRAM').metrics.engagements).toBe(4) // NOT 3
})

test('Instagram engagement rate reads `engagement`; effectiveness reads effectiveness_engagements', () => {
  const ig: DashContentPost = {
    id: 6, source: 'INSTAGRAM', type: 'IMAGE',
    instagram: { caption: 'y', engagement: 0.125, engagement_rate_public: 0.09375, effectiveness_engagements: 0.031, effectiveness: 0.134 },
  }
  const p = normalizePost(ig, 'INSTAGRAM')
  expect(p.metrics.engagementRate).toBe(0.125)  // = Dash (F), NOT engagement_rate_public 0.09375
  expect(p.metrics.effectiveness).toBe(0.031)    // = Dash Effectiveness (fraction; card ×100 → 3.1%)
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

// Regression (live CONTENT probe, brand 26952, 2026-07-31): organic IG/FB posts return
// `impressions: 0` — the deprecated-impressions trap the profile KPI avoids by using VIEWS
// (metrics.ts header). The exposure that Dash actually populates is `views` (Instagram) and
// `organic_views` (Facebook). Reading `impressions` blanked the Views/Impr. column to 0 for
// every IG and FB post; these lock in the populated fields.
test('Instagram exposure reads `views`, not the always-0 organic `impressions` (captured fixture)', () => {
  const fixture = JSON.parse(
    readFileSync('lib/organic-social/__fixtures__/content-creative.json', 'utf8'),
  ) as ContentResponse
  const first = fixture.data.content[0] // real IG post: impressions 0, views 20
  expect((first.instagram as Record<string, unknown>).impressions).toBe(0) // guards the fixture's realism
  const p = normalizePost(first, 'INSTAGRAM')
  expect(p.metrics.impressions).toBe(20) // = views, NOT 0
})

test('Facebook exposure reads `organic_views`, not the always-0 organic `impressions`', () => {
  const fb: DashContentPost = {
    id: 700000001, source: 'FACEBOOK', type: 'IMAGE', source_created_at: '2026-06-15T00:00:00Z',
    facebook: { message: 'benefits', url: 'https://facebook.com/p/700000001', total_engagements_public: 4, impressions: 0, organic_views: 55 },
  }
  const p = normalizePost(fb, 'FACEBOOK')
  expect(p.metrics.impressions).toBe(55) // = organic_views, NOT 0
})

test('toTopContentRows maps normalized posts to the interim table rows', () => {
  const posts: TopContentPost[] = [
    { id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'a', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 10, engagementRate: 0.03, engagements: 50, impressions: 1200 }, sourceType: 'organic' },
  ]
  const rows = toTopContentRows(posts)
  expect(rows[0]).toMatchObject({ id: 1, platform: 'Instagram', engagements: 50, views: 1200, sourceType: 'organic', publishDate: '2026-06-01' })
})

// --- TikTok (added with the channel, 2026-09-15) -------------------------------
//
// The payload SHAPE (field names, which fields exist, how they relate) is copied from a live
// CONTENT probe of a TikTok-reporting brand (August 2026). The VALUES are invented: this repo is
// public and carries no client figures. They keep the probed relationships that matter:
// total_engagements = likes + comments + shares, engagement_rate = engagements / reach,
// views_based_engagement_rate = engagements / views, and effectiveness above 1. The decoy
// fields are the ones a reasonable person would reach for and that would be WRONG, so each
// assertion names what it is rejecting.
const tiktokPost: DashContentPost = {
  id: 900001,
  source: 'TIKTOK',
  type: 'IMAGE',            // TikTok posts arrive typed IMAGE, see the media-type test
  source_created_at: '2026-08-14T16:31:00Z',
  media_group: null,
  tiktok: {
    caption: 'Example TikTok caption for the fixture.',
    share_url: 'https://www.tiktok.com/@example-brand/video/900001',
    total_engagements: 12,
    likes: 9, comments: 1, shares: 2,
    // The probed account ran no paid, so views === organic_views there. Split here on
    // purpose: equal values cannot distinguish the two fields, and an account with paid
    // WOULD return views > organic_views.
    views: 250,
    organic_views: 240,
    reach: 200,
    engagement_rate: 0.06,                 // 12 / 200 engagements / reach  <- the one Dash averages
    views_based_engagement_rate: 0.05,     // 12 / 240 engagements / views  <- decoy
    followers_based_engagement_rate: 0.004, // decoy
    effectiveness: 1.25,                   // ABOVE 1, not a fraction <- must be ignored
    duration: 15.5,
  },
}

test('TikTok engagements read total_engagements (= likes + comments + shares)', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.metrics.engagements).toBe(12)
})

test('TikTok views read organic_views, NOT bare views (organic-only, as Facebook does)', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.metrics.impressions).toBe(240)
  expect(p.metrics.impressions).not.toBe(250)
})

// The tie-break that settled this: over a month of probed posts, the MEAN of per-post
// engagement_rate matched Dash's profile AVG_ENGAGEMENT_RATE to 8 decimals, and the mean
// of views_based_engagement_rate did not. Both reconcile arithmetically, so only this pins it.
test('TikTok engagement rate reads engagement_rate, NOT views_based_engagement_rate', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.metrics.engagementRate).toBe(0.06)
  expect(p.metrics.engagementRate).not.toBe(0.05)
})

// TikTok exposes an `effectiveness` field and it is NOT the 0..1 fraction every other
// channel stores: every probed value sat above 1. Reading it would put "125%" on a
// card. Dash has no TikTok effectiveness KPI either (EFFECTIVENESS / AVG_EFFECTIVENESS
// both 400), so there is nothing to reconcile against. Null, like LinkedIn and X.
test('TikTok effectiveness is null even though the payload carries an effectiveness field', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.metrics.effectiveness).toBeNull()
  expect(tiktokPost.tiktok!.effectiveness).toBe(1.25) // the decoy is really there
})

test('TikTok permalink reads share_url (the channel has no url key)', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.url).toBe('https://www.tiktok.com/@example-brand/video/900001')
})

test('TikTok caption and platform label resolve', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.caption).toBe('Example TikTok caption for the fixture.')
  expect(p.platform).toBe('TikTok')
  expect(p.channel).toBe('TIKTOK')
  expect(p.publishedAt).toBe('2026-08-14')
})

// Every TikTok post in the probed set came back type IMAGE with a post-level `image`
// object and NO `video` object, despite being videos. Pinned so a future reader does
// not "fix" it into VIDEO and expect a playable src that the payload never carries.
test('TikTok posts normalize as IMAGE, matching what the vendor actually returns', () => {
  const p = normalizePost(tiktokPost, 'TIKTOK')
  expect(p.mediaType).toBe('IMAGE')
})
