import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { PlatformHeadlines } from './platform-headlines'
import { EngagementTrend } from './trends'
import { TopContent } from './top-content'
import { DashTimeoutError } from '@/lib/dash-social/client'

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

export async function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null,
}: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  const effectiveCompare = compareRange ?? 'previous_period'
  const [headlines, trend, top] = await Promise.all([
    safe(getPlatformHeadlines(clientSlug, dateRange, effectiveCompare)),
    safe(getEngagementTrend(clientSlug, dateRange)),
    safe(getTopContent(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {headlines.data ? <PlatformHeadlines headlines={headlines.data} /> : <Fallback kind={headlines.error!} />}
      {trend.data ? <EngagementTrend series={trend.data} /> : <Fallback kind={trend.error!} />}
      {top.data ? <TopContent groups={top.data} /> : <Fallback kind={top.error!} />}
    </div>
  )
}
