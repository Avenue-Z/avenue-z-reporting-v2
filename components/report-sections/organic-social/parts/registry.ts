import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { engagementTrendV1 } from './engagement-trend'
import { followerGraphV1 } from './follower-graph'
import { topContentV1, topContentV2 } from './top-content'
import { topAiRetrievedV1 } from './top-ai-retrieved'

export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1 },
  'engagement-trend': { 1: engagementTrendV1 },
  'follower-graph': { 1: followerGraphV1 },
  'top-content': { 1: topContentV1, 2: topContentV2 },
  'top-ai-retrieved': { 1: topAiRetrievedV1 },
}
