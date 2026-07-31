import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { ownedAiRetrievedContent } from '@/lib/organic-social/ai-retrievals'
import { TopAiRetrievedList } from '../top-ai-retrieved-list'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function TopAiRetrievedSection({ clientSlug }: OrganicSocialCtx) {
  const r = await safe(ownedAiRetrievedContent(clientSlug))
  return r.data ? <TopAiRetrievedList items={r.data} /> : <Fallback kind={r.error!} />
}

export const topAiRetrievedV1: PartImpl<OrganicSocialCtx> = {
  id: 'top-ai-retrieved',
  version: 1,
  published: true,
  defaultLabel: 'Top AI-Retrieved Content',
  render: (ctx) => (
    <Suspense fallback={<div className="h-24 animate-pulse rounded bg-muted" />}>
      <TopAiRetrievedSection {...ctx} />
    </Suspense>
  ),
}
