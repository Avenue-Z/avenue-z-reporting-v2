import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { PlatformHeadlines } from '../platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

/** The v1 tiles for one view. `outline` is set only by the outline Data part's fallback (outline-data.tsx): an
 *  outline client's Overview or uncovered channel (Piper's X) then follows its outline tiles' rules, the change
 *  measured against the size of the prior (so a rise from a negative prior shows a rise) and shown whole from 1%,
 *  one decimal under it. The v1 part below never passes it: Renaissance asks with exactly the four arguments it
 *  always has and keeps the signed change, which only Thomas and Paul together may change. */
export async function HeadlinesSection({ clientSlug, dateRange, compareRange, channel, outline }: OrganicSocialCtx & { outline?: boolean }) {
  const r = await safe(outline
    ? getPlatformHeadlines(clientSlug, dateRange, compareRange, channel, 'size')
    : getPlatformHeadlines(clientSlug, dateRange, compareRange, channel))
  return r.data ? <PlatformHeadlines headlines={r.data} wholeDelta={outline} /> : <Fallback kind={r.error!} />
}

/** The v1 tiles in their Suspense, the one copy both callers render: the v1 part below, and the outline Data part's
 *  fallback (outline-data.tsx) with `outline`. Without it the element carries no `outline` prop at all, so the v1
 *  part renders exactly as before. */
export const headlinesV1 = (ctx: OrganicSocialCtx, outline?: boolean) => (
  <Suspense fallback={<HeadlinesSkeleton />}>
    <HeadlinesSection {...ctx} {...(outline ? { outline } : {})} />
  </Suspense>
)

export const platformHeadlinesV1: PartImpl<OrganicSocialCtx> = {
  id: 'platform-headlines',
  version: 1,
  published: true,
  defaultLabel: 'Platform Headlines',
  render: (ctx) => headlinesV1(ctx),
}
