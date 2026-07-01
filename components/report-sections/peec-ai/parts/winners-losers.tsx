import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { WinnersLosersCards } from '../winners-losers-cards'

export const winnersLosersV1: PartImpl<PeecCtx> = {
  id: 'winners-losers',
  version: 1,
  published: true,
  defaultLabel: 'Winners & Losers',
  render: (ctx) => {
    const { clientSlug, winners, losers } = ctx
    return (
      <WinnersLosersCards
        clientSlug={clientSlug}
        winners={winners}
        losers={losers}
      />
    )
  },
}
