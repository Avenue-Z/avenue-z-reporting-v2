import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getTopContent } from '@/lib/organic-social/top-content'
import { TopContent } from '../top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function TopContentSection({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  const r = await safe(getTopContent(clientSlug, dateRange, channel))
  return r.data ? <TopContent groups={r.data} /> : <Fallback kind={r.error!} />
}

export const topContentV1: PartImpl<OrganicSocialCtx> = {
  id: 'top-content',
  version: 1,
  published: true,
  defaultLabel: 'Top Performing Posts',
  render: (ctx) => (
    <Suspense fallback={<TopContentSkeleton />}>
      <TopContentSection {...ctx} />
    </Suspense>
  ),
}
