// Dash Social metric map — validated against Renaissance (brand 26952) on
// 2026-06-23 by replicating the Dash dashboard's own /reports/data requests.
//
// KEY LEARNINGS (why this looks the way it does):
//  - Dash's overview uses report_type=TOTAL_GROUPED_METRIC + aggregate_by=BRAND
//    with timezone-aware dates (midnight Eastern, e.g. 2026-06-16T04:00:00Z) and
//    require_posts=true. Plain TOTAL_METRIC returns different / wrong values.
//  - Metric NAMES differ per channel (Facebook uses *_V2 / *_POSTS_V2 variants).
//  - A multi-channel request mis-aggregates Facebook, so each channel is queried
//    SEPARATELY (one request per channel) and the brand entry carries the values.
//  - Engagement rate is taken DIRECTLY from Dash (AVG_ENGAGEMENT_RATE, or
//    AVG_ENGAGEMENT_RATE_V2 for FB), a 0..1 fraction — this matches the Dash UI
//    exactly and avoids the deprecated-impressions problem (organic IG/FB
//    IMPRESSIONS return 0/null; the real exposure metric is VIEWS).
//
// RESPONSE SHAPES:
//  - Headline (TOTAL_GROUPED_METRIC, aggregate_by=BRAND, single channel):
//      data["<brandId>"].metrics[METRIC].value
//  - Engagement-over-time (GRAPH, time_scale=DAILY, single channel):
//      data.metrics[METRIC].ALL_CHANNELS[date]   (value | null per day)

export const CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const
export type DashChannel = (typeof CHANNELS)[number]

export const CHANNEL_LABEL: Record<DashChannel, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
}

/** Resolve the reportable Dash channels, honoring an optional lowercase allowlist.
 *  Absent/empty ⇒ all four. Order always follows CHANNELS.
 *  NOTE: a non-empty allowlist matching no supported channel resolves to [] (the honest answer),
 *  which blanks the section. The safeguard is config-write validation, not a fallback here —
 *  tracked as a FOLLOW-UP on DashSocialConfig.channels in lib/db/schema.ts (PR #168 review #2). */
export function resolveChannels(allowlist?: string[] | null): DashChannel[] {
  if (!allowlist?.length) return [...CHANNELS]
  const up = allowlist.map((c) => c.toUpperCase())
  return CHANNELS.filter((c) => up.includes(c))
}

export interface ChannelMetricMap {
  followers: string
  netNewFollowers: string
  engagements: string
  /** Dash-computed engagement rate (0..1). */
  engagementRate: string
  /** Per-channel exposure metric (views for IG/FB, impressions for X/LinkedIn). */
  exposure: string
  exposureLabel: 'Views' | 'Impressions'
}

export const CHANNEL_METRICS: Record<DashChannel, ChannelMetricMap> = {
  INSTAGRAM: {
    followers: 'TOTAL_FOLLOWERS',
    netNewFollowers: 'NET_NEW_FOLLOWERS',
    engagements: 'TOTAL_ENGAGEMENTS',
    engagementRate: 'AVG_ENGAGEMENT_RATE',
    exposure: 'VIEWS',
    exposureLabel: 'Views',
  },
  FACEBOOK: {
    followers: 'TOTAL_FOLLOWERS',
    netNewFollowers: 'NET_NEW_FOLLOWERS',
    engagements: 'TOTAL_ENGAGEMENTS_POSTS_V2',
    engagementRate: 'AVG_ENGAGEMENT_RATE_V2',
    exposure: 'PAID_AND_ORGANIC_VIEWS_BY_POST',
    exposureLabel: 'Views',
  },
  TWITTER: {
    followers: 'TOTAL_FOLLOWERS',
    netNewFollowers: 'NET_NEW_FOLLOWERS',
    engagements: 'TOTAL_ENGAGEMENTS',
    engagementRate: 'AVG_ENGAGEMENT_RATE',
    exposure: 'IMPRESSIONS',
    exposureLabel: 'Impressions',
  },
  LINKEDIN: {
    followers: 'TOTAL_FOLLOWERS',
    netNewFollowers: 'NET_NEW_FOLLOWERS',
    engagements: 'ENGAGEMENTS',
    engagementRate: 'AVG_ENGAGEMENT_RATE',
    exposure: 'IMPRESSIONS',
    exposureLabel: 'Impressions',
  },
}
