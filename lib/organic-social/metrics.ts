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
 *  'byPost'    = only posts published in the window (findings §3a, §6.2).
 *  byPost is a genuine subset of allPosts (byPost ≤ allPosts) for every metric EXCEPT
 *  X (TWITTER) exposure, where the two columns are DIFFERENT Dash measures rather than
 *  one measure re-scoped, so the by-post figure is not bounded by all-posts and can land
 *  either side of it — see the TWITTER.exposure note below. */
export const REPORTING_BASIS: ReportingBasis = 'byPost'

export interface KpiSpec {
  key: string                              // stable id: 'followers', 'exposure'
  label: string                            // display label ('Total Followers', 'Views')
  /** Metric name per basis. Identical entries are deliberate, not duplication. */
  metric: Record<ReportingBasis, string>
  /** number vs percent formatting. Carried on the spec now; consumed when M3 renders
   *  the KPI list generically (M2's headline formats its fixed five fields inline). */
  format: 'number' | 'percent'
  /** Rendered as a caveat under the card (used by M3 — decision 6, Facebook). */
  footnote?: string
}

// Overview shows five KPIs (OVERVIEW_KPI_KEYS); a platform subpage shows the full
// per-channel set below (M3 — 9–11 KPIs). Names: all-posts copied from the pre-M2
// CHANNEL_METRICS; by-post from findings §6.2 / §7.1 and the M3 probe. `followers`,
// `netNewFollowers`, `engagementRate` are basis-neutral (identical both columns).
//
// M3 breakdown-KPI by-post names confirmed live 2026-07-29 via
// scripts/probe-m3-kpi-names.ts (brand 26952, window 06-22..07-22):
//  - Instagram/Facebook/X breakdown KPIs are basis-neutral bare names (their _BY_POST
//    variants 400 "Invalid combination"); only the bare name is valid on the channel.
//  - LinkedIn reactions/comments/shares/postClicks have real _BY_POST variants (used
//    under byPost); profileViews has NO by-post variant (PAGE_VIEWS_BY_POST 400s) so
//    it falls back to PAGE_VIEWS_ALL_POSTS — a page-level metric, inherently all-posts.
export const PLATFORM_KPIS: Record<DashChannel, KpiSpec[]> = {
  INSTAGRAM: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'VIEWS',             byPost: 'VIEWS' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
    { key: 'profileViews',    label: 'Profile Views',   format: 'number',  metric: { allPosts: 'PROFILE_VIEWS',    byPost: 'PROFILE_VIEWS' } },
    { key: 'likes',           label: 'Likes',           format: 'number',  metric: { allPosts: 'ORGANIC_LIKES',    byPost: 'ORGANIC_LIKES' } },
    { key: 'comments',        label: 'Comments',        format: 'number',  metric: { allPosts: 'ORGANIC_COMMENTS', byPost: 'ORGANIC_COMMENTS' } },
    { key: 'shares',          label: 'Shares',          format: 'number',  metric: { allPosts: 'SHARES',           byPost: 'SHARES' } },
    { key: 'saves',           label: 'Saves',           format: 'number',  metric: { allPosts: 'SAVES',            byPost: 'SAVES' } },
    { key: 'reposts',         label: 'Reposts',         format: 'number',  metric: { allPosts: 'REPOSTS',          byPost: 'REPOSTS' } },
  ],
  FACEBOOK: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' },
      footnote: 'Includes engagement on posts marked Influencer (Dash reports Facebook totals inclusive).' },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' } },
    // Facebook has NO Profile Views KPI (decision 7 / findings §7.5) — omitted.
    { key: 'reactions',       label: 'Reactions',       format: 'number',  metric: { allPosts: 'REACTIONS',        byPost: 'REACTIONS' } },
    { key: 'comments',        label: 'Comments',        format: 'number',  metric: { allPosts: 'TOTAL_COMMENTS',   byPost: 'TOTAL_COMMENTS' } },
    { key: 'shares',          label: 'Shares',          format: 'number',  metric: { allPosts: 'SHARES',           byPost: 'SHARES' } },
    { key: 'postClicks',      label: 'Post Clicks',     format: 'number',  metric: { allPosts: 'POST_CLICKS',      byPost: 'POST_CLICKS' } },
  ],
  TWITTER: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    // by-post names confirmed live via scripts/probe-m2-by-post-impressions.ts (brand 26952).
    // X exposure is NOT a subset re-scope, unlike every other by-post metric: bare X
    // IMPRESSIONS and IMPRESSIONS_BY_POST are two DIFFERENT Dash measures. Proof (re-probed
    // 2026-07-31, window 06-22..07-22): X has NO IMPRESSIONS_ALL_POSTS — it 400s "not available
    // for channel: TWITTER" — so bare IMPRESSIONS is a separately-computed account/timeline-level
    // tally, not the post-level superset of IMPRESSIONS_BY_POST. Contrast LinkedIn, where bare
    // IMPRESSIONS === IMPRESSIONS_ALL_POSTS (both 13248) and IMPRESSIONS_BY_POST (12481) is a
    // strict subset. Because X's two figures are measured differently, their difference has no
    // fixed sign: 183→299 (↑) in the window Step-9 recorded, 708→452 (↓) on 2026-07-31. X
    // engagements DO stay a subset (50→48). So the X exposure change is a change of measurement
    // basis, not a window-narrowing — which is why a by-post value can exceed the all-posts value.
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
    // Profile *Clicks*, not Views (decision 7). Breakdown KPIs are basis-neutral bare names.
    { key: 'profileClicks',   label: 'Profile Clicks',  format: 'number',  metric: { allPosts: 'PROFILE_CLICKS',   byPost: 'PROFILE_CLICKS' } },
    { key: 'likes',           label: 'Likes',           format: 'number',  metric: { allPosts: 'LIKES',            byPost: 'LIKES' } },
    { key: 'replies',         label: 'Replies',         format: 'number',  metric: { allPosts: 'REPLIES',          byPost: 'REPLIES' } },
    { key: 'reposts',         label: 'Reposts',         format: 'number',  metric: { allPosts: 'RETWEETS',         byPost: 'RETWEETS' } },
    { key: 'linkClicks',      label: 'Link Clicks',     format: 'number',  metric: { allPosts: 'LINK_CLICKS',      byPost: 'LINK_CLICKS' } },
  ],
  LINKEDIN: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'ENGAGEMENTS',       byPost: 'ENGAGEMENTS_BY_POST' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
    // Breakdown KPIs move all-posts → by-post under the active basis (findings §6.3).
    { key: 'reactions',       label: 'Reactions',       format: 'number',  metric: { allPosts: 'REACTIONS_ALL_POSTS', byPost: 'REACTIONS_BY_POST' } },
    { key: 'comments',        label: 'Comments',        format: 'number',  metric: { allPosts: 'COMMENTS_ALL_POSTS',  byPost: 'COMMENTS_BY_POST' } },
    { key: 'shares',          label: 'Shares',          format: 'number',  metric: { allPosts: 'SHARES_ALL_POSTS',    byPost: 'SHARES_BY_POST' } },
    { key: 'postClicks',      label: 'Post Clicks',     format: 'number',  metric: { allPosts: 'CLICKS_ALL_POSTS',    byPost: 'CLICKS_BY_POST' } },
    // No by-post variant (PAGE_VIEWS_BY_POST 400s) — page-level, inherently all-posts.
    { key: 'profileViews',    label: 'Profile Views',   format: 'number',  metric: { allPosts: 'PAGE_VIEWS_ALL_POSTS', byPost: 'PAGE_VIEWS_ALL_POSTS' } },
  ],
}

/** The subset Overview shows, by key, in display order. Overview stays 5-up. */
export const OVERVIEW_KPI_KEYS = ['followers', 'netNewFollowers', 'exposure',
                                  'engagements', 'engagementRate'] as const

/** KPIs that are THEMSELVES a period-over-period change, so a "— vs prior period" comparison
 *  placeholder reads as broken rather than informative — Net New Followers is a delta by
 *  definition. Headline cards suppress the placeholder for these (PR #182 review #1). */
const KPI_KEYS_WITHOUT_COMPARISON = new Set<string>(['netNewFollowers'])
export const expectsComparison = (key: string): boolean => !KPI_KEYS_WITHOUT_COMPARISON.has(key)

/** The metric name for a KPI under the active basis. */
export const metricFor = (k: KpiSpec): string => k.metric[REPORTING_BASIS]

/** Per-channel key→spec index so kpiFor is O(1), not a linear scan per lookup
 *  (headlines resolves 5 keys per channel per render). Built once at module load. */
const KPI_INDEX: Record<DashChannel, Record<string, KpiSpec>> = Object.fromEntries(
  CHANNELS.map((ch) => [ch, Object.fromEntries(PLATFORM_KPIS[ch].map((k) => [k.key, k]))]),
) as Record<DashChannel, Record<string, KpiSpec>>

/** The KpiSpec for a key on a channel. Throws if absent — a missing Overview key is a bug. */
export function kpiFor(channel: DashChannel, key: string): KpiSpec {
  const spec = KPI_INDEX[channel][key]
  if (!spec) throw new Error(`no KPI '${key}' for channel ${channel}`)
  return spec
}

/** Convenience: the active-basis metric name for a channel+key. */
export const metricForKey = (channel: DashChannel, key: string): string => metricFor(kpiFor(channel, key))

/** Every KPI key for a channel, in display order (platform subpages show all of these). */
export const platformKpiKeys = (channel: DashChannel): string[] => PLATFORM_KPIS[channel].map((k) => k.key)
