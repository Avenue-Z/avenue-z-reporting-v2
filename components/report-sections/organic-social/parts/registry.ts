import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { platformHeadlinesV2, platformHeadlinesV3 } from './outline-data'
import { engagementBreakdownV1 } from './engagement-breakdown'
import { engagementTrendV1 } from './engagement-trend'
import { followerGraphV1 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'

export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1, 2: platformHeadlinesV2, 3: platformHeadlinesV3 },
  'engagement-trend': { 1: engagementTrendV1 },
  // Per-client, unpublished: the outline's metrics directly under the engagement graph.
  'engagement-breakdown': { 1: engagementBreakdownV1 },
  'follower-graph': { 1: followerGraphV1 },
  'top-content': { 1: topContentV1, 2: topContentV2 },
}
