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

// Renaissance renders Instagram, Facebook, X and LinkedIn and must not move when TikTok changes.
// Pins every tile on those four as a WHOLE object, in order: key, label, format, both metric
// names, footnote, and any field added to KpiSpec later. Copied from origin/dev's PLATFORM_KPIS on
// 2026-09-21 and hard-coded, so the test never reads the module it guards. The first version pinned
// only keys and metric names, so renaming "Profile Views" passed (Paul's re-review of PR 247).
// Pinning the whole object closes that for every field at once, not one field at a time.
test('the non-TikTok channels are untouched by TikTok changes', () => {
  const RENAISSANCE_TILES = {
    INSTAGRAM: [
      { key: 'followers', label: 'Total Followers', format: 'number', metric: { allPosts: 'TOTAL_FOLLOWERS', byPost: 'TOTAL_FOLLOWERS' } },
      { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
      { key: 'exposure', label: 'Views', format: 'number', metric: { allPosts: 'VIEWS', byPost: 'VIEWS' } },
      { key: 'engagements', label: 'Engagements', format: 'number', metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' } },
      { key: 'engagementRate', label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
      { key: 'profileViews', label: 'Profile Views', format: 'number', metric: { allPosts: 'PROFILE_VIEWS', byPost: 'PROFILE_VIEWS' } },
      { key: 'likes', label: 'Likes', format: 'number', metric: { allPosts: 'ORGANIC_LIKES', byPost: 'ORGANIC_LIKES' } },
      { key: 'comments', label: 'Comments', format: 'number', metric: { allPosts: 'ORGANIC_COMMENTS', byPost: 'ORGANIC_COMMENTS' } },
      { key: 'shares', label: 'Shares', format: 'number', metric: { allPosts: 'SHARES', byPost: 'SHARES' } },
      { key: 'saves', label: 'Saves', format: 'number', metric: { allPosts: 'SAVES', byPost: 'SAVES' } },
      { key: 'reposts', label: 'Reposts', format: 'number', metric: { allPosts: 'REPOSTS', byPost: 'REPOSTS' } },
    ],
    FACEBOOK: [
      { key: 'followers', label: 'Total Followers', format: 'number', metric: { allPosts: 'TOTAL_FOLLOWERS', byPost: 'TOTAL_FOLLOWERS' } },
      { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
      { key: 'exposure', label: 'Views', format: 'number', metric: { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' } },
      { key: 'engagements', label: 'Engagements', format: 'number', metric: { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' }, footnote: 'Includes engagement on posts marked Influencer (Dash reports Facebook totals inclusive).' },
      { key: 'engagementRate', label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' } },
      { key: 'reactions', label: 'Reactions', format: 'number', metric: { allPosts: 'REACTIONS', byPost: 'REACTIONS' } },
      { key: 'comments', label: 'Comments', format: 'number', metric: { allPosts: 'TOTAL_COMMENTS', byPost: 'TOTAL_COMMENTS' } },
      { key: 'shares', label: 'Shares', format: 'number', metric: { allPosts: 'SHARES', byPost: 'SHARES' } },
      { key: 'postClicks', label: 'Post Clicks', format: 'number', metric: { allPosts: 'POST_CLICKS', byPost: 'POST_CLICKS' } },
    ],
    TWITTER: [
      { key: 'followers', label: 'Total Followers', format: 'number', metric: { allPosts: 'TOTAL_FOLLOWERS', byPost: 'TOTAL_FOLLOWERS' } },
      { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
      { key: 'exposure', label: 'Impressions', format: 'number', metric: { allPosts: 'IMPRESSIONS', byPost: 'IMPRESSIONS_BY_POST' } },
      { key: 'engagements', label: 'Engagements', format: 'number', metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' } },
      { key: 'engagementRate', label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
      { key: 'profileClicks', label: 'Profile Clicks', format: 'number', metric: { allPosts: 'PROFILE_CLICKS', byPost: 'PROFILE_CLICKS' } },
      { key: 'likes', label: 'Likes', format: 'number', metric: { allPosts: 'LIKES', byPost: 'LIKES' } },
      { key: 'replies', label: 'Replies', format: 'number', metric: { allPosts: 'REPLIES', byPost: 'REPLIES' } },
      { key: 'reposts', label: 'Reposts', format: 'number', metric: { allPosts: 'RETWEETS', byPost: 'RETWEETS' } },
      { key: 'linkClicks', label: 'Link Clicks', format: 'number', metric: { allPosts: 'LINK_CLICKS', byPost: 'LINK_CLICKS' } },
    ],
    LINKEDIN: [
      { key: 'followers', label: 'Total Followers', format: 'number', metric: { allPosts: 'TOTAL_FOLLOWERS', byPost: 'TOTAL_FOLLOWERS' } },
      { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
      { key: 'exposure', label: 'Impressions', format: 'number', metric: { allPosts: 'IMPRESSIONS', byPost: 'IMPRESSIONS_BY_POST' } },
      { key: 'engagements', label: 'Engagements', format: 'number', metric: { allPosts: 'ENGAGEMENTS', byPost: 'ENGAGEMENTS_BY_POST' } },
      { key: 'engagementRate', label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
      { key: 'reactions', label: 'Reactions', format: 'number', metric: { allPosts: 'REACTIONS_ALL_POSTS', byPost: 'REACTIONS_BY_POST' } },
      { key: 'comments', label: 'Comments', format: 'number', metric: { allPosts: 'COMMENTS_ALL_POSTS', byPost: 'COMMENTS_BY_POST' } },
      { key: 'shares', label: 'Shares', format: 'number', metric: { allPosts: 'SHARES_ALL_POSTS', byPost: 'SHARES_BY_POST' } },
      { key: 'postClicks', label: 'Post Clicks', format: 'number', metric: { allPosts: 'CLICKS_ALL_POSTS', byPost: 'CLICKS_BY_POST' } },
      { key: 'profileViews', label: 'Profile Views', format: 'number', metric: { allPosts: 'PAGE_VIEWS_ALL_POSTS', byPost: 'PAGE_VIEWS_ALL_POSTS' } },
    ],
  }
  for (const [channel, tiles] of Object.entries(RENAISSANCE_TILES)) {
    expect(PLATFORM_KPIS[channel as DashChannel], channel).toStrictEqual(tiles)
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
