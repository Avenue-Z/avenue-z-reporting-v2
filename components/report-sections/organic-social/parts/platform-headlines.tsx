import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { PlatformHeadlines } from '../platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function HeadlinesSection({ clientSlug, dateRange, compareRange, channel }: OrganicSocialCtx) {
  const r = await safe(getPlatformHeadlines(clientSlug, dateRange, compareRange, channel))
  return r.data ? <PlatformHeadlines headlines={r.data} /> : <Fallback kind={r.error!} />
}

export const platformHeadlinesV1: PartImpl<OrganicSocialCtx> = {
  id: 'platform-headlines',
  version: 1,
  published: true,
  defaultLabel: 'Platform Headlines',
  render: (ctx) => (
    <Suspense fallback={<HeadlinesSkeleton />}>
      <HeadlinesSection {...ctx} />
    </Suspense>
  ),
}
