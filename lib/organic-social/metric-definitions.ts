// Jasmine's appendix ("Appendix for all Metrics and all Accounts", 2026-10-06), quoted verbatim, keyed by the
// tile key each tab draws (outline-layout.ts, metrics.ts). Edit a text only by re-quoting the appendix; the test
// pins a hash so a drift is deliberate. Source: 'Avenue Z' (the team's own definitions, not Dash's).
import type { DashChannel } from './metrics'
import { OUTLINE_KPI_OVERRIDES } from './outline-layout'

const FOLLOWERS = 'The total number of followers you have on this channel.'
const NET_NEW = 'The net new number of people who have followed your account.'
const VIEWS = 'The number of times your posts were viewed or displayed.'
const ENGAGEMENT_RATE = 'The percentage of people who engaged with your posts after seeing them.'
const PROFILE_VIEWS = 'The number of times your profile was viewed.'
const VIDEO_VIEWS = 'The number of times your videos were viewed.'
const LIKES = 'The number of likes your posts received.'
const COMMENTS = 'The number of comments your posts received.'
const SHARES = 'The number of times your posts were shared.'
const engagements = (formula: string) => `The total number of engagements your posts received. ${formula}`

export const ORGANIC_SOCIAL_DEFINITIONS: Record<DashChannel, Record<string, string>> = {
  INSTAGRAM: {
    followers: FOLLOWERS, netNewFollowers: NET_NEW, exposure: VIEWS,
    engagements: engagements('Organic Likes + Saves + Comments + Shares + Reposts.'),
    engagementRate: ENGAGEMENT_RATE, profileViews: PROFILE_VIEWS, videoViews: VIDEO_VIEWS,
    likes: LIKES, comments: COMMENTS, shares: SHARES,
    saves: 'The number of times your posts were saved.',
    reposts: 'The number of times your posts have been reposted.',
  },
  FACEBOOK: {
    followers: FOLLOWERS, netNewFollowers: NET_NEW, exposure: VIEWS,
    engagements: engagements('Organic Reactions + Comments + Shares + Post Clicks'),
    engagementRate: ENGAGEMENT_RATE, videoViews: VIDEO_VIEWS,
    reactions: 'The number of reactions your posts received (Like, Love, Care, Haha, Wow, Sad, Angry).',
    comments: COMMENTS, shares: SHARES,
    postClicks: 'The number of times a user clicked anywhere on your posts. Post Clicks = Link Clicks + Photo View Clicks + Other Clicks',
  },
  LINKEDIN: {
    followers: FOLLOWERS, netNewFollowers: NET_NEW, exposure: VIEWS,
    engagements: engagements('Organic Clicks + Reactions + Comments + Reposts'),
    engagementRate: ENGAGEMENT_RATE, profileViews: PROFILE_VIEWS, videoViews: VIDEO_VIEWS,
    reactions: 'The number of reactions your posts received.', comments: COMMENTS, shares: SHARES,
    postClicks: 'The number of times people clicked on your posts.',
  },
  TIKTOK: {
    followers: FOLLOWERS, netNewFollowers: NET_NEW, exposure: VIEWS,
    engagements: engagements('Organic Likes + Comments + Shares + Favorites.'),
    engagementRate: ENGAGEMENT_RATE, profileViews: PROFILE_VIEWS, videoViews: VIDEO_VIEWS,
    likes: LIKES, comments: COMMENTS, shares: SHARES,
    favorites: 'The total number of times your posts have been added to favorites.',
    completionRate: 'The percentage of viewers that watched your videos to completion.',
  },
  TWITTER: {
    followers: FOLLOWERS, netNewFollowers: NET_NEW, exposure: VIEWS,
    engagements: engagements('Organic Reposts + Replies + Likes + Link Clicks.'),
    engagementRate: ENGAGEMENT_RATE,
    profileClicks: 'The number of times your profile has been clicked from your posts.',
    likes: LIKES,
    replies: 'The number of replies your posts received.',
    reposts: 'The number of times your posts were reposted.',
    linkClicks: 'The number of times links on your posts were clicked.',
  },
}

/** The "Top Performing Posts" line of the appendix, for the section heading. */
export const TOP_POSTS_DEFINITION = 'Top Performers by metric (Views/Engagements)'

/** The text for a tile, or undefined (a row with no appendix text, or a channel name the appendix does not cover). The
 *  channel is a string because the shared headline type carries it as one (lib/organic-social/types.ts). */
export function metricDefinition(channel: string, key: string): string | undefined {
  return (ORGANIC_SOCIAL_DEFINITIONS as Record<string, Record<string, string>>)[channel]?.[key]
}

/** The text for a SHARED tile (PlatformHeadlines: Renaissance, an X tab, an outline client's Overview). A key the
 *  outline overrides on that channel (OUTLINE_KPI_OVERRIDES: Instagram and LinkedIn Engagement Rate) reads a different
 *  metric on the shared tile than on the outline tab, and the appendix text describes the tab's number, so such a tile
 *  draws no badge. */
export function sharedTileDefinition(channel: string, key: string): string | undefined {
  return OUTLINE_KPI_OVERRIDES[channel]?.[key] ? undefined : metricDefinition(channel, key)
}
