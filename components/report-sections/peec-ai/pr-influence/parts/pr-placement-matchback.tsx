import type { PartImpl } from '@/lib/report-sections/types'
import { PRPlacementMatchbackTable } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const prPlacementMatchbackV1: PartImpl<PrInfluenceCtx> = {
  id: 'pr-placement-matchback', version: 1, published: true, defaultLabel: 'PR Placement Matchback',
  render: (ctx) => (
    <PRPlacementMatchbackTable rows={ctx.matchback.rows} totalPlacements={ctx.totalPlacements} placementsCitedByAI={ctx.matchback.citedCount} />
  ),
}
