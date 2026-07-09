import type { PartRegistry } from '@/lib/report-sections/types'
import type { PrInfluenceCtx } from '../ctx'
import { prSynopsisV1 } from './pr-synopsis'
import { prPlacementMatchbackV1 } from './pr-placement-matchback'
import { sentimentInsightsV1 } from './sentiment-insights'
import { editorialAndClustersV1 } from './editorial-and-clusters'
import { brandAbsentEditorialV1 } from './brand-absent-editorial'

export const PR_INFLUENCE_PARTS: PartRegistry<PrInfluenceCtx> = {
  'pr-synopsis':            { 1: prSynopsisV1 },
  'pr-placement-matchback': { 1: prPlacementMatchbackV1 },
  'sentiment-insights':     { 1: sentimentInsightsV1 },
  'editorial-and-clusters': { 1: editorialAndClustersV1 },
  'brand-absent-editorial': { 1: brandAbsentEditorialV1 },
}
