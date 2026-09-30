import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { PlatformHeadlines } from '../platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

/** The v1 tiles for one view. `wholeDelta` is set only by the outline Data part's fallback (outline-data.tsx);
 *  the v1 part below never passes it. */
export async function HeadlinesSection({ clientSlug, dateRange, compareRange, channel, wholeDelta }: OrganicSocialCtx & { wholeDelta?: boolean }) {
  const r = await safe(getPlatformHeadlines(clientSlug, dateRange, compareRange, channel))
  return r.data ? <PlatformHeadlines headlines={r.data} wholeDelta={wholeDelta} /> : <Fallback kind={r.error!} />
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
