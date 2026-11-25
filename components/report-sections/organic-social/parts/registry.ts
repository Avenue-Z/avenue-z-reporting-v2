import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { mergeRegistries } from '@/lib/report-sections/registry'
import { platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { engagementBreakdownV1 } from './engagement-breakdown'
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ytdReviewV3 } from './ytd-review-live'
import { ytdReviewV4 } from './ytd-review-locked'
import { platformHeadlinesV1 } from './platform-headlines'
import { engagementTrendV1, engagementTrendV2 } from './engagement-trend'
import { followerGraphV1, followerGraphV2 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'
import { topContentV3 } from './top-content-outline'
import { influencerPostsV1 } from './influencer-posts'
import { kpiCheckInV1 } from './kpi-check-in'
import { KIT_TILES_PARTS } from './kit/tiles.parts'
import { KIT_TRENDS_PARTS } from './kit/trends.parts'
import { KIT_YTD_PARTS } from './kit/ytd.parts'
import { KIT_POSTS_PARTS } from './kit/posts.parts'
import { KIT_KPI_CHECK_IN_PARTS } from './kit/kpi-check-in.parts'

const BASE_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1 },
  'engagement-trend': { 1: engagementTrendV1, 2: engagementTrendV2 },
  'follower-graph': { 1: followerGraphV1, 2: followerGraphV2 },
  'top-content': { 1: topContentV1, 2: topContentV2 },
}

/** Per-client parts, all unpublished: the outline's Data block (platform-headlines@2 and @3) and
 *  the engagement breakdown under the engagement graph. A client pins them in its own config.
 *  Kept apart from the parts above so those lines stay exactly as they are. */
const OUTLINE_PARTS: PartRegistry<OrganicSocialCtx> = {
  'ytd-review': { 1: ytdReviewV1, 2: ytdReviewV2, 3: ytdReviewV3, 4: ytdReviewV4 },
  'platform-headlines': { 2: platformHeadlinesV2, 3: platformHeadlinesV3 },
  'engagement-breakdown': { 1: engagementBreakdownV1 },
  'top-content': { 3: topContentV3 },
  // The Influencer tab's part (10/6 calls), composed by the 'organic-social:influencer' template.
  'influencer-posts': { 1: influencerPostsV1 },
  // The KPI Check-In (10/6 calls), pinned on one client's Overview through extraParts.
  'kpi-check-in': { 1: kpiCheckInV1 },
}

/** Every version registered before the design kit. Exported so `kit/slots.test.ts` can prove no kit version replaces one. */
export const PRE_KIT_PARTS: PartRegistry<OrganicSocialCtx> = mergeRegistries(BASE_PARTS, OUTLINE_PARTS)

/** The design kit's versions (docs/superpowers/plans/2026-11-23-os-design-phase1.md), one file per PR under `kit/`, so
 *  those PRs never edit this file and merge in any order. All unpublished; `kit/slots.test.ts` holds them to that. */
export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = mergeRegistries(
  PRE_KIT_PARTS,
  KIT_TILES_PARTS,
  KIT_TRENDS_PARTS,
  KIT_YTD_PARTS,
  KIT_POSTS_PARTS,
  KIT_KPI_CHECK_IN_PARTS,
)
