import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { engagementTrendV1, engagementTrendV2 } from './engagement-trend'
import { followerGraphV1, followerGraphV2 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'

export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1 },
  'engagement-trend': { 1: engagementTrendV1, 2: engagementTrendV2 },
  'follower-graph': { 1: followerGraphV1, 2: followerGraphV2 },
  'top-content': { 1: topContentV1, 2: topContentV2 },
}
