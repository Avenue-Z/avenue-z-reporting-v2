import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { SHOW_AI_NARRATIVE } from '@/lib/constants'
import { PRInfluenceSynopsis } from '../../pr-influence-synopsis'
import { SynopsisSkeleton } from '../../synopsis-skeleton'
import type { PrInfluenceCtx } from '../ctx'

export const prSynopsisV1: PartImpl<PrInfluenceCtx> = {
  id: 'pr-synopsis', version: 1, published: true, defaultLabel: 'Executive Synopsis',
  render: (ctx) => {
    if (!SHOW_AI_NARRATIVE) return null
    return (
      <Suspense fallback={<SynopsisSkeleton />}>
        <PRInfluenceSynopsis clientSlug={ctx.clientSlug} dateRange={ctx.dateRange} context={ctx.synopsisContext} />
      </Suspense>
    )
  },
}
