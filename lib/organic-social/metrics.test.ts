import { expect, test } from 'vitest'
import {
  PLATFORM_KPIS, OVERVIEW_KPI_KEYS, REPORTING_BASIS,
  kpiFor, metricFor, metricForKey, CHANNELS, type DashChannel,
} from './metrics'

// The all-posts column MUST equal the exact metric names the shipped code used
// (copied from the pre-M2 CHANNEL_METRICS). This is the "no numbers move" guard
// for M2a; it also pins the by-post column so M2b's flip is a data change, not a
// name discovery. Source: findings §6.2 / §7.1 (see the plan's reference table).
const EXPECTED: Record<DashChannel, Record<string, { allPosts: string; byPost: string }>> = {
  INSTAGRAM: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'VIEWS',             byPost: 'VIEWS' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
  FACEBOOK: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' },
  },
  TWITTER: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    // X exposure/engagements move under by-post. by-post names are placeholders in
    // M2a (the allPosts column is what M2a proves); M2b Step 1 probe-confirms them.
    exposure:        { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
  LINKEDIN: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' },
    engagements:     { allPosts: 'ENGAGEMENTS',       byPost: 'ENGAGEMENTS_BY_POST' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
  // TikTok has NO _BY_POST variants: VIDEO_VIEWS_BY_POST, TOTAL_ENGAGEMENTS_BY_POST,
  // LIKES_BY_POST, SHARES_BY_POST, COMMENTS_BY_POST, PROFILE_VIEWS_BY_POST and
  // REACH_BY_POST all 400 (probed 2026-09-15). TikTok spells post-based with a TOTAL_
  // prefix instead, so exposure is VIDEO_VIEWS (all posts) and TOTAL_VIDEO_VIEWS (by post).
  // Bare VIEWS 400s. The other four Overview KPIs carry one name in both columns.
  TIKTOK: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'VIDEO_VIEWS',       byPost: 'TOTAL_VIDEO_VIEWS' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
}

// TikTok breakdown KPIs under the active basis. Dash distinguishes the two bases by
// LABEL, not by a _BY_POST suffix: "X - Total - All Posts" counts any video active in
// the window (activity), "X - Total" counts videos PUBLISHED in it (post-based). TikTok
// exposes no _BY_POST variant at all, which is why the suffix search came up empty.
// Probed live 2026-09-17 on a real August window: the post-based likes + comments +
// shares reconcile exactly with TOTAL_ENGAGEMENTS; the activity-based ones sum to more
// and do not.
const TIKTOK_BREAKDOWN: Record<string, { allPosts: string; byPost: string }> = {
  likes:    { allPosts: 'ORGANIC_LIKES',    byPost: 'TOTAL_LIKES' },
  comments: { allPosts: 'ORGANIC_COMMENTS', byPost: 'TOTAL_COMMENTS' },
  shares:   { allPosts: 'SHARES',           byPost: 'TOTAL_SHARES' },
}

test('TikTok breakdown KPIs carry the post-based name under byPost', () => {
  for (const [key, want] of Object.entries(TIKTOK_BREAKDOWN)) {
    const spec = kpiFor('TIKTOK', key)
    expect(spec.metric.allPosts).toBe(want.allPosts)
    expect(spec.metric.byPost).toBe(want.byPost)
  }
})

// Renaissance renders Instagram, Facebook, X and LinkedIn and must not move when
// TikTok changes. Pins every tile key and both metric names on those four, copied from
// dev's PLATFORM_KPIS, so an edit that leaks out of the TIKTOK block, or adds or drops a
// tile on one of them, fails here rather than in a client's report.
test('the non-TikTok channels are untouched by TikTok changes', () => {
  const PINNED: Record<string, Record<string, [string, string]>> = {
    INSTAGRAM: {
      followers: ['TOTAL_FOLLOWERS', 'TOTAL_FOLLOWERS'],
      netNewFollowers: ['NET_NEW_FOLLOWERS', 'NET_NEW_FOLLOWERS'],
      exposure: ['VIEWS', 'VIEWS'],
      engagements: ['TOTAL_ENGAGEMENTS', 'TOTAL_ENGAGEMENTS'],
      engagementRate: ['AVG_ENGAGEMENT_RATE', 'AVG_ENGAGEMENT_RATE'],
      profileViews: ['PROFILE_VIEWS', 'PROFILE_VIEWS'],
      likes: ['ORGANIC_LIKES', 'ORGANIC_LIKES'],
      comments: ['ORGANIC_COMMENTS', 'ORGANIC_COMMENTS'],
      shares: ['SHARES', 'SHARES'],
      saves: ['SAVES', 'SAVES'],
      reposts: ['REPOSTS', 'REPOSTS'],
    },
    FACEBOOK: {
      followers: ['TOTAL_FOLLOWERS', 'TOTAL_FOLLOWERS'],
      netNewFollowers: ['NET_NEW_FOLLOWERS', 'NET_NEW_FOLLOWERS'],
      exposure: ['PAID_AND_ORGANIC_VIEWS_BY_POST', 'PAID_AND_ORGANIC_VIEWS_BY_POST'],
      engagements: ['TOTAL_ENGAGEMENTS_POSTS_V2', 'TOTAL_ENGAGEMENTS_POSTS_V2'],
      engagementRate: ['AVG_ENGAGEMENT_RATE_V2', 'AVG_ENGAGEMENT_RATE_V2'],
      reactions: ['REACTIONS', 'REACTIONS'],
      comments: ['TOTAL_COMMENTS', 'TOTAL_COMMENTS'],
      shares: ['SHARES', 'SHARES'],
      postClicks: ['POST_CLICKS', 'POST_CLICKS'],
    },
    TWITTER: {
      followers: ['TOTAL_FOLLOWERS', 'TOTAL_FOLLOWERS'],
      netNewFollowers: ['NET_NEW_FOLLOWERS', 'NET_NEW_FOLLOWERS'],
      exposure: ['IMPRESSIONS', 'IMPRESSIONS_BY_POST'],
      engagements: ['TOTAL_ENGAGEMENTS', 'TOTAL_ENGAGEMENTS_POSTS'],
      engagementRate: ['AVG_ENGAGEMENT_RATE', 'AVG_ENGAGEMENT_RATE'],
      profileClicks: ['PROFILE_CLICKS', 'PROFILE_CLICKS'],
      likes: ['LIKES', 'LIKES'],
      replies: ['REPLIES', 'REPLIES'],
      reposts: ['RETWEETS', 'RETWEETS'],
      linkClicks: ['LINK_CLICKS', 'LINK_CLICKS'],
    },
    LINKEDIN: {
      followers: ['TOTAL_FOLLOWERS', 'TOTAL_FOLLOWERS'],
      netNewFollowers: ['NET_NEW_FOLLOWERS', 'NET_NEW_FOLLOWERS'],
      exposure: ['IMPRESSIONS', 'IMPRESSIONS_BY_POST'],
      engagements: ['ENGAGEMENTS', 'ENGAGEMENTS_BY_POST'],
      engagementRate: ['AVG_ENGAGEMENT_RATE', 'AVG_ENGAGEMENT_RATE'],
      reactions: ['REACTIONS_ALL_POSTS', 'REACTIONS_BY_POST'],
      comments: ['COMMENTS_ALL_POSTS', 'COMMENTS_BY_POST'],
      shares: ['SHARES_ALL_POSTS', 'SHARES_BY_POST'],
      postClicks: ['CLICKS_ALL_POSTS', 'CLICKS_BY_POST'],
      profileViews: ['PAGE_VIEWS_ALL_POSTS', 'PAGE_VIEWS_ALL_POSTS'],
    },
  }
  for (const [channel, keys] of Object.entries(PINNED)) {
    // Same keys in the same order: no tile added to or dropped from a Renaissance channel.
    expect(PLATFORM_KPIS[channel as DashChannel].map((s) => s.key)).toEqual(Object.keys(keys))
    for (const [key, [allPosts, byPost]] of Object.entries(keys)) {
      const spec = kpiFor(channel as DashChannel, key)
      expect(`${channel}.${key}.allPosts=${spec.metric.allPosts}`).toBe(`${channel}.${key}.allPosts=${allPosts}`)
      expect(`${channel}.${key}.byPost=${spec.metric.byPost}`).toBe(`${channel}.${key}.byPost=${byPost}`)
    }
  }
})

// (A) Both basis columns are pinned data — this test never changes at the flip.
test('PLATFORM_KPIS pins both basis columns for every Overview KPI', () => {
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) {
      const spec = kpiFor(channel, key)
      expect(spec.metric.allPosts).toBe(EXPECTED[channel][key].allPosts)
      expect(spec.metric.byPost).toBe(EXPECTED[channel][key].byPost)
    }
  }
})

// (B) Overview asks for exactly its five keys, and every channel supplies them.
test('every channel supplies all five Overview KPIs', () => {
  expect(OVERVIEW_KPI_KEYS).toEqual(['followers','netNewFollowers','exposure','engagements','engagementRate'])
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) expect(() => kpiFor(channel, key)).not.toThrow()
  }
})

// (C) The resolver honors the active basis — basis-agnostic, survives the flip.
test('metricForKey resolves through the active REPORTING_BASIS', () => {
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) {
      expect(metricForKey(channel, key)).toBe(kpiFor(channel, key).metric[REPORTING_BASIS])
      expect(metricFor(kpiFor(channel, key))).toBe(kpiFor(channel, key).metric[REPORTING_BASIS])
    }
  }
})

// (E) The exposure label the headline still renders (preserves today's exposureLabel).
test('exposure label is Views for IG/FB, Impressions for X/LI', () => {
  expect(kpiFor('INSTAGRAM', 'exposure').label).toBe('Views')
  expect(kpiFor('FACEBOOK', 'exposure').label).toBe('Views')
  expect(kpiFor('TWITTER', 'exposure').label).toBe('Impressions')
  expect(kpiFor('LINKEDIN', 'exposure').label).toBe('Impressions')
})

// M2b: the basis has been flipped. This is the single revertable assertion that
// pins the visible change. Test (A) already pins the by-post NAMES; this pins the
// active BASIS. Reverting the one-line flip in metrics.ts makes exactly this fail.
test('M2b: active basis is byPost', () => {
  expect(REPORTING_BASIS).toBe('byPost')
})
