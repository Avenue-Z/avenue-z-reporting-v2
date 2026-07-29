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

/** Fetch targets for a getter: all resolved channels on Overview (unscoped); the single channel
 *  on a platform subpage (scoped). A scoped view for a channel outside the client's allowlist has
 *  nothing to show and is a routing/config error — throw so it surfaces as an error card rather
 *  than a silent empty state (PR #168 review R2 #2). Unscoped returns `channels` unchanged. */
export function resolveTargets(channels: DashChannel[], channel: DashChannel | null): DashChannel[] {
  if (!channel) return channels
  if (!channels.includes(channel)) {
    throw new Error(`channel '${channel}' is not in this client's Organic Social allowlist`)
  }
  return [channel]
}

/** The one scoped-error decision: a scoped (single-channel) view rethrows a per-channel failure so
 *  it surfaces; Overview degrades to `degradeValue` (dropped downstream). Callers supply only the
 *  degrade payload — all that differed between the getters (PR #168 review R2 #4). */
export function channelErrorPolicy<T>(scoped: boolean, error: unknown, degradeValue: T): T {
  if (scoped) throw error
  return degradeValue
}

export type ReportingBasis = 'allPosts' | 'byPost'

/** The active reporting basis. M2b flips this one constant — decisions 3 & 4.
 *  'allPosts'  = every post active in the window (older posts still accruing).
 *  'byPost'    = only posts published in the window (findings §3a, §6.2). */
export const REPORTING_BASIS: ReportingBasis = 'byPost'

export interface KpiSpec {
  key: string                              // stable id: 'followers', 'exposure'
  label: string                            // display label ('Total Followers', 'Views')
  /** Metric name per basis. Identical entries are deliberate, not duplication. */
  metric: Record<ReportingBasis, string>
  format: 'number' | 'percent'
  /** Rendered as a caveat under the card (used by M3 — decision 6, Facebook). */
  footnote?: string
}

// Overview shows five KPIs, un-aggregated. M3 extends each channel's list to the
// full 10–11; M2 carries only the five Overview keys. Names: all-posts copied from
// the pre-M2 CHANNEL_METRICS; by-post from findings §6.2 / §7.1. `followers`,
// `netNewFollowers`, `engagementRate` are basis-neutral (identical both columns).
export const PLATFORM_KPIS: Record<DashChannel, KpiSpec[]> = {
  INSTAGRAM: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'VIEWS',             byPost: 'VIEWS' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
  FACEBOOK: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' } },
  ],
  TWITTER: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    // by-post names confirmed live in M2b Step 1 before the flip.
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
  LINKEDIN: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'ENGAGEMENTS',       byPost: 'ENGAGEMENTS_BY_POST' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
}

/** The subset Overview shows, by key, in display order. Overview stays 5-up. */
export const OVERVIEW_KPI_KEYS = ['followers', 'netNewFollowers', 'exposure',
                                  'engagements', 'engagementRate'] as const

/** The metric name for a KPI under the active basis. */
export const metricFor = (k: KpiSpec): string => k.metric[REPORTING_BASIS]

/** The KpiSpec for a key on a channel. Throws if absent — a missing Overview key is a bug. */
export function kpiFor(channel: DashChannel, key: string): KpiSpec {
  const spec = PLATFORM_KPIS[channel].find((k) => k.key === key)
  if (!spec) throw new Error(`no KPI '${key}' for channel ${channel}`)
  return spec
}

/** Convenience: the active-basis metric name for a channel+key. */
export const metricForKey = (channel: DashChannel, key: string): string => metricFor(kpiFor(channel, key))
