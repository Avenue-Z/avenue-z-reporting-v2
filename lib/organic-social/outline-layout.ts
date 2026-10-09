// Jasmine's three outlines (2026-09-18), as data: which tiles form a platform tab's Data block
// and which sit directly under its engagement graph, with her labels. Read only by the opt-in
// parts platform-headlines@2/@3 and engagement-breakdown@1. The shared tiles (PLATFORM_KPIS),
// which Renaissance reads, are not touched. Keyed by channel name so the TikTok rows can sit
// here before TikTok joins CHANNELS; they switch on when it does.
import { PLATFORM_KPIS, type DashChannel, type KpiSpec } from './metrics'

/** A row of the outline. `unavailable` marks a row Dash does not offer: it is shown blank with
 *  that flag and never requested (Jasmine's rule for missing data: "flag it for review and leave
 *  it blank"). `from` reads another tile of the same tab. */
export type OutlineRow = { key: string; label: string; unavailable?: string; from?: string }

/** No outline row carries this flag today. It was on Facebook Profile Views and TikTok Reposts,
 *  neither of which Dash offers; Jasmine settled both on 2026-09-22 ("for FB, we can just remove all
 *  together and for TT can replace reposts with favorites?"), so Facebook's row is gone and TikTok's
 *  is Favorites. Kept because it is the documented way to show a row Dash cannot fill, if one ever
 *  appears again. */
export const NOT_IN_DASH = 'Not available from Dash'
/** A row whose own Dash request failed (Views on Reels): blank with this flag, the rest of the
 *  block unchanged. */
export const MEDIA_FAILED = 'Could not load from Dash'
export type OutlineVariant = 'standard' | 'profileClicks'

/** Outline rows Dash has but the shared tiles do not. Probed 2026-09-18 in the tiles' own request
 *  shape (TOTAL_GROUPED_METRIC, aggregate_by=BRAND, require_posts, one channel). Each is the only
 *  name Dash accepts for the row, so it fills both basis columns. */
export const OUTLINE_EXTRA_KPIS: Partial<Record<string, KpiSpec[]>> = {
  INSTAGRAM: [{ key: 'profileClicks', label: 'Profile Clicks', format: 'number', metric: { allPosts: 'PROFILE_CLICKS', byPost: 'PROFILE_CLICKS' } }],
  FACEBOOK: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'PAID_AND_ORGANIC_VIDEO_VIEWS', byPost: 'PAID_AND_ORGANIC_VIDEO_VIEWS' } }],
  LINKEDIN: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'VIDEO_VIEWS_BY_POST', byPost: 'VIDEO_VIEWS_BY_POST' } }],
  // Jasmine, 2026-09-22: TikTok's Reposts row becomes Favorites. Dash's TikTok catalogue offers one
  // favorites metric, TOTAL_FAVORITES ("Favorites - Total"); probed 2026-09-22 in the tiles' request
  // shape on both bases, and it equals the sum of the per-post favorites field for the same window.
  TIKTOK: [{ key: 'favorites', label: 'Favorites', format: 'number', metric: { allPosts: 'TOTAL_FAVORITES', byPost: 'TOTAL_FAVORITES' } }],
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
const notInDash = (key: string, label: string): OutlineRow => ({ key, label, unavailable: NOT_IN_DASH })
const DATA_HEAD = [
  row('followers', 'Total Followers'), row('netNewFollowers', 'Net New Followers'), row('exposure', 'Views'),
  row('engagements', 'Total Engagements'), row('engagementRate', 'Engagement Rate'),
]
const PROFILE_VIEWS = row('profileViews', 'Profile Views')
const VIDEO_VIEWS = row('videoViews', 'Video Views')

const STANDARD: Partial<Record<string, OutlineRow[]>> = {
  INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS, VIDEO_VIEWS],
  // Facebook has no Profile Views row: Dash does not offer it and Jasmine removed it (2026-09-22).
  FACEBOOK: [...DATA_HEAD, VIDEO_VIEWS],
  LINKEDIN: [...DATA_HEAD, PROFILE_VIEWS, VIDEO_VIEWS],
  TIKTOK: [...DATA_HEAD, PROFILE_VIEWS, { key: 'videoViews', label: 'Video Views', from: 'exposure' }],
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
  TIKTOK: [row('likes', 'Likes'), COMMENTS, SHARES, row('favorites', 'Favorites'), row('completionRate', 'Completion Rate')],
}

/** A Data row that comes from its own Dash request, not the tiles' one. Instagram "Video Views"
 *  is Views on Reels: Meta retired organic video views and Dash reports Reels views under
 *  MULTI_METRIC_MEDIA_TYPE (probed 2026-09-21, with a compare value in the tiles' shape). */
export type MediaKpiSpec = { key: string; label: string; mediaType: string; metric: string }
export const OUTLINE_MEDIA_KPIS: Partial<Record<string, MediaKpiSpec[]>> = {
  INSTAGRAM: [{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }],
}
/** The media rows a tab's outline rows actually show (none for Kenect's Instagram). */
export function mediaRowsFor(channel: string, rows: readonly OutlineRow[]): MediaKpiSpec[] {
  const keys = new Set(rows.filter((r) => !r.unavailable).map((r) => r.key))
  return (OUTLINE_MEDIA_KPIS[channel] ?? []).filter((m) => keys.has(m.key))
}

/** Every tile spec an outline tab requests: the shared tiles (with the outline overrides swapped
 *  in by key), then the extra rows. */
export function outlineSpecsFor(channel: DashChannel): KpiSpec[] {
  const overrides = OUTLINE_KPI_OVERRIDES[channel] ?? {}
  const swapped = PLATFORM_KPIS[channel].map((k) => (overrides[k.key] ? { ...k, metric: overrides[k.key] } : k))
  return [...swapped, ...(OUTLINE_EXTRA_KPIS[channel] ?? [])]
}
