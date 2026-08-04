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
}

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
