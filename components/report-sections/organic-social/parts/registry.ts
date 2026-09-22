import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { mergeRegistries } from '@/lib/report-sections/registry'
import { platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { engagementBreakdownV1 } from './engagement-breakdown'
import { ytdReviewV1 } from './ytd-review'
import { platformHeadlinesV1 } from './platform-headlines'
import { engagementTrendV1 } from './engagement-trend'
import { followerGraphV1 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'
import { topContentV3 } from './top-content-outline'

const BASE_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1 },
  'engagement-trend': { 1: engagementTrendV1 },
  'follower-graph': { 1: followerGraphV1 },
  'top-content': { 1: topContentV1, 2: topContentV2 },
}

/** Per-client parts, all unpublished: the outline's Data block (platform-headlines@2 and @3) and
 *  the engagement breakdown under the engagement graph. A client pins them in its own config.
 *  Kept apart from the parts above so those lines stay exactly as they are. */
const OUTLINE_PARTS: PartRegistry<OrganicSocialCtx> = {
  'ytd-review': { 1: ytdReviewV1 },
  'platform-headlines': { 2: platformHeadlinesV2, 3: platformHeadlinesV3 },
  'engagement-breakdown': { 1: engagementBreakdownV1 },
  'top-content': { 3: topContentV3 },
}

export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = mergeRegistries(BASE_PARTS, OUTLINE_PARTS)
