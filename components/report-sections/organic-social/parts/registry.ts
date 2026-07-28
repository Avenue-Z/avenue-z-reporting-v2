import type { PartRegistry } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { engagementTrendV1 } from './engagement-trend'
import { topContentV1 } from './top-content'

export const ORGANIC_SOCIAL_PARTS: PartRegistry<OrganicSocialCtx> = {
  'platform-headlines': { 1: platformHeadlinesV1 },
  'engagement-trend': { 1: engagementTrendV1 },
  'top-content': { 1: topContentV1 },
}
