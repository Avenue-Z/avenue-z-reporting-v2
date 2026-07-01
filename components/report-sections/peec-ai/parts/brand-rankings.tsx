import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'

export const brandRankingsV1: PartImpl<PeecCtx> = {
  id: 'brand-rankings',
  version: 1,
  published: true,
  defaultLabel: 'Brand Rankings',
  render: (ctx) => {
    const { data, Rankings } = ctx
    return <Rankings rankings={data.brandRankings} />
  },
}
