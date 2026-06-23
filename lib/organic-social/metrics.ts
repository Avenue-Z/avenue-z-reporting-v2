// Confirmed against Renaissance (Dash brand 26952) via scripts/dash-social-probe.ts on 2026-06-23.
//
// Validity matrix (TOTAL_METRIC on /reports/data):
//   IG/FB/X : TOTAL_FOLLOWERS, NET_NEW_FOLLOWERS, IMPRESSIONS, TOTAL_ENGAGEMENTS  ← blended-safe
//   IG only : PROFILE_VIEWS, SAVES, VIEWS
//   IG + FB : SHARES
//   X only  : LIKES        FB only: REACTIONS
//   invalid : COMMENTS, EFFECTIVENESS (not valid metric names on these channels)
//
// A multi-channel request 400s if ANY metric is invalid for ANY channel, so
// blended sections use only the four common metrics below. Per-channel-only
// metrics (Profile Views, Saves, Likes, Reactions, Avg. Effectiveness) are
// deferred — they cannot be blended uniformly and aren't in v1.

export const CHANNELS = ['INSTAGRAM', 'FACEBOOK', 'TWITTER'] as const
export type DashChannel = (typeof CHANNELS)[number]

export const METRICS = {
  totalFollowers: 'TOTAL_FOLLOWERS',
  netNewFollowers: 'NET_NEW_FOLLOWERS',
  impressions: 'IMPRESSIONS',
  engagements: 'TOTAL_ENGAGEMENTS',
} as const

/** Engagement Rate = TOTAL_ENGAGEMENTS / IMPRESSIONS (reach unavailable for >30d windows). */
export const ENGAGEMENT_RATE_BASIS = 'impressions' as const

/** /reports/data exposes no aggregate EFFECTIVENESS on these channels (400). Deferred. */
export const HAS_AGGREGATE_EFFECTIVENESS = false
