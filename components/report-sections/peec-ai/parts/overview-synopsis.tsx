import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { OverviewSynopsis } from '../overview-synopsis'
import { SynopsisSkeleton } from '../synopsis-skeleton'
import { showAeoSynopsis } from '@/lib/constants'

export const overviewSynopsisV1: PartImpl<PeecCtx> = {
  id: 'overview-synopsis',
  version: 1,
  published: true,
  defaultLabel: 'AI Narrative',
  render: (ctx) => {
    const { clientSlug, dateRange, provider, data, aiTraffic } = ctx
    if (!showAeoSynopsis(clientSlug)) return null
    return (
      <Suspense fallback={<SynopsisSkeleton />}>
        <OverviewSynopsis
          clientSlug={clientSlug}
          dateRange={dateRange}
          provider={provider}
          data={data}
          aiSessions={aiTraffic.available ? aiTraffic.sessions : null}
        />
      </Suspense>
    )
  },
}
