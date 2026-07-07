import { Suspense } from 'react'
import { SHOW_AI_NARRATIVE } from '@/lib/constants'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { PlatformHeadlines } from './platform-headlines'
import { EngagementTrend } from './trends'
import { TopContent } from './top-content'
import { OrganicSocialSynopsis } from './synopsis'
import { SynopsisSkeleton, HeadlinesSkeleton, TrendSkeleton, TopContentSkeleton } from './skeletons'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try { return { data: await p } }
  catch (e) { return { error: e instanceof DashTimeoutError ? 'timeout' : 'error' } }
}

function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout' ? 'Taking longer than usual — try a shorter date range.' : "Couldn't load this section."}
    </div>
  )
}

async function HeadlinesSection({ clientSlug, dateRange, compareRange }: { clientSlug: string; dateRange: string; compareRange: string | null }) {
  const effectiveCompare = compareRange ?? 'previous_period'
  const r = await safe(getPlatformHeadlines(clientSlug, dateRange, effectiveCompare))
  return r.data ? <PlatformHeadlines headlines={r.data} /> : <Fallback kind={r.error!} />
}

async function TrendSection({ clientSlug, dateRange }: { clientSlug: string; dateRange: string }) {
  const r = await safe(getEngagementTrend(clientSlug, dateRange))
  return r.data ? <EngagementTrend series={r.data} /> : <Fallback kind={r.error!} />
}

async function TopContentSection({ clientSlug, dateRange }: { clientSlug: string; dateRange: string }) {
  const r = await safe(getTopContent(clientSlug, dateRange))
  return r.data ? <TopContent groups={r.data} /> : <Fallback kind={r.error!} />
}

export function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null,
}: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="organic-social" clientSlug={clientSlug} />
      {SHOW_AI_NARRATIVE && (
        <Suspense fallback={<SynopsisSkeleton />}>
          <OrganicSocialSynopsis clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
        </Suspense>
      )}
      <Suspense fallback={<HeadlinesSkeleton />}>
        <HeadlinesSection clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>
      <Suspense fallback={<TrendSkeleton />}>
        <TrendSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
      <Suspense fallback={<TopContentSkeleton />}>
        <TopContentSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
    </div>
  )
}
