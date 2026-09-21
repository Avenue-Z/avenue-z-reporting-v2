// Jasmine's three outlines (2026-09-18), as data: which tiles form a platform tab's Data block
// and which sit directly under its engagement graph, with her labels. Read only by the opt-in
// parts platform-headlines@2/@3 and engagement-breakdown@1. The shared tiles (PLATFORM_KPIS),
// which Renaissance reads, are not touched. Keyed by channel name so the TikTok rows can sit
// here before TikTok joins CHANNELS; they switch on when it does.
import { PLATFORM_KPIS, type DashChannel, type KpiSpec } from './metrics'

export type OutlineRow = { key: string; label: string }
export type OutlineVariant = 'standard' | 'profileClicks'

/** Outline rows Dash has but the shared tiles do not. Probed 2026-09-18 in the tiles' own request
 *  shape (TOTAL_GROUPED_METRIC, aggregate_by=BRAND, require_posts, one channel). Each is the only
 *  name Dash accepts for the row, so it fills both basis columns. */
export const OUTLINE_EXTRA_KPIS: Partial<Record<string, KpiSpec[]>> = {
  INSTAGRAM: [{ key: 'profileClicks', label: 'Profile Clicks', format: 'number', metric: { allPosts: 'PROFILE_CLICKS', byPost: 'PROFILE_CLICKS' } }],
  FACEBOOK: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'PAID_AND_ORGANIC_VIDEO_VIEWS', byPost: 'PAID_AND_ORGANIC_VIDEO_VIEWS' } }],
  LINKEDIN: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'VIDEO_VIEWS_BY_POST', byPost: 'VIDEO_VIEWS_BY_POST' } }],
}

/** Engagement Rate in the outline block follows the team's monthly decks. Jasmine, 2026-09-21:
 *  "engagement rate should divide by views not followers so just follow the deck". Checked against
 *  the August decks in the tiles' own request shape: Instagram's views-based rate lands within 3% of
 *  all three Instagram decks, LinkedIn's by-post rate within 3.4%, and both return a compare value in
 *  the batched request, so the change arrow works. Facebook keeps its shared rate
 *  (AVG_ENGAGEMENT_RATE_V2): it matches one of the two Facebook decks, and the other does not
 *  reconcile on any tile yet. TikTok's (AVG_ENGAGEMENT_RATE) matched its deck. An entry swaps only the
 *  metric of the shared tile with the same key, only inside the outline block: PLATFORM_KPIS, which
 *  Renaissance reads, keeps AVG_ENGAGEMENT_RATE. */
export const OUTLINE_KPI_OVERRIDES: Partial<Record<string, Record<string, KpiSpec['metric']>>> = {
  INSTAGRAM: { engagementRate: { allPosts: 'AVG_ENGAGEMENT_RATE_VIEWS', byPost: 'AVG_ENGAGEMENT_RATE_VIEWS' } },
  LINKEDIN: { engagementRate: { allPosts: 'AVG_ENGAGEMENT_RATE_ALL_POSTS', byPost: 'AVG_ENGAGEMENT_RATE_BY_POST' } },
}

const row = (key: string, label: string): OutlineRow => ({ key, label })
const DATA_HEAD = [
  row('followers', 'Total Followers'), row('netNewFollowers', 'Net New Followers'), row('exposure', 'Views'),
  row('engagements', 'Total Engagements'), row('engagementRate', 'Engagement Rate'),
]
const PROFILE_VIEWS = row('profileViews', 'Profile Views')
const VIDEO_VIEWS = row('videoViews', 'Video Views')

const STANDARD: Partial<Record<string, OutlineRow[]>> = {
  INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS], // Video Views: question 6
  FACEBOOK: [...DATA_HEAD, VIDEO_VIEWS], // Profile Views: question 6
  LINKEDIN: [...DATA_HEAD, PROFILE_VIEWS, VIDEO_VIEWS],
  TIKTOK: [...DATA_HEAD, PROFILE_VIEWS], // Video Views: question 6
}

export const OUTLINE_DATA_ROWS: Record<OutlineVariant, Partial<Record<string, OutlineRow[]>>> = {
  standard: STANDARD,
  // Kenect Nashville's outline: Profile Clicks instead of Video Views. It covers Instagram only,
  // so any other channel the client has keeps the standard rows.
  profileClicks: { ...STANDARD, INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS, row('profileClicks', 'Profile Clicks')] },
}

const COMMENTS = row('comments', 'Comments')
const SHARES = row('shares', 'Shares')
const PAGE_BREAKDOWN = [row('reactions', 'Reactions'), COMMENTS, SHARES, row('postClicks', 'Post Clicks')]

export const OUTLINE_BREAKDOWN_ROWS: Partial<Record<string, OutlineRow[]>> = {
  INSTAGRAM: [row('likes', 'Likes'), COMMENTS, SHARES, row('saves', 'Saves'), row('reposts', 'Reposts')],
  FACEBOOK: PAGE_BREAKDOWN,
  LINKEDIN: PAGE_BREAKDOWN,
  TIKTOK: [row('likes', 'Likes'), COMMENTS, SHARES, row('completionRate', 'Completion Rate')], // Reposts: question 6
}

/** The outline rows not rendered yet (Jasmine's question 6, sent 2026-09-18). The reasons are as of
 *  her answers on 2026-09-21. Each row is a one-line move into the rows above once its metric is
 *  wired; until then it is left blank, her rule for missing data. */
export const OUTLINE_PENDING_Q6 = [
  { channel: 'INSTAGRAM', block: 'data', label: 'Video Views', why: 'Instagram retired organic video views (Dash labels them Discontinued); the replacement, Views on Reels, needs its own request, not built yet' },
  { channel: 'FACEBOOK', block: 'data', label: 'Profile Views', why: "not found in Dash's API or its app code; Jasmine sees it on dashboards she builds, and the metric behind them is not identified yet" },
  { channel: 'TIKTOK', block: 'data', label: 'Video Views', why: "the same number as Views (Dash's TikTok views are video views, TOTAL_VIDEO_VIEWS); showing it is a separate change" },
  { channel: 'TIKTOK', block: 'breakdown', label: 'Reposts', why: "not found in Dash's API or its app code; Jasmine sees it on dashboards she builds, and the metric behind them is not identified yet" },
] as const

/** Every tile spec an outline tab requests: the shared tiles (with the outline overrides swapped
 *  in by key), then the extra rows. */
export function outlineSpecsFor(channel: DashChannel): KpiSpec[] {
  const overrides = OUTLINE_KPI_OVERRIDES[channel] ?? {}
  const swapped = PLATFORM_KPIS[channel].map((k) => (overrides[k.key] ? { ...k, metric: overrides[k.key] } : k))
  return [...swapped, ...(OUTLINE_EXTRA_KPIS[channel] ?? [])]
}
