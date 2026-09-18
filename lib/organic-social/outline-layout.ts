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

/** The outline rows that do not work as written. Jasmine's question 6, sent 2026-09-18. Not
 *  rendered until she answers; each answer is a one-line move into the rows above. */
export const OUTLINE_PENDING_Q6 = [
  { channel: 'INSTAGRAM', block: 'data', label: 'Video Views', why: 'always zero: Instagram folded video views into Views' },
  { channel: 'FACEBOOK', block: 'data', label: 'Profile Views', why: 'Dash counts post views, not profile visits' },
  { channel: 'TIKTOK', block: 'data', label: 'Video Views', why: 'the same number as Views' },
  { channel: 'TIKTOK', block: 'breakdown', label: 'Reposts', why: 'no longer reported by Dash' },
] as const

/** Every tile spec an outline tab requests: the shared tiles, then the extra rows. */
export function outlineSpecsFor(channel: DashChannel): KpiSpec[] {
  return [...PLATFORM_KPIS[channel], ...(OUTLINE_EXTRA_KPIS[channel] ?? [])]
}
