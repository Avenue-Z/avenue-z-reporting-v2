import { getOrganicKpis } from '@/lib/organic-social/kpis'
import { getChannelRows } from '@/lib/organic-social/channels'
import { getTrends } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { OrganicKpiGrid } from './kpi-grid'
import { ChannelContribution } from './channel-contribution'
import { Trends } from './trends'
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
  const [kpis, channels, trends, top] = await Promise.all([
    safe(getOrganicKpis(clientSlug, dateRange, effectiveCompare)),
    safe(getChannelRows(clientSlug, dateRange)),
    safe(getTrends(clientSlug, dateRange)),
    safe(getTopContent(clientSlug, dateRange)),
  ])
  return (
    <div className="space-y-8">
      {kpis.data ? <OrganicKpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {channels.data ? <ChannelContribution rows={channels.data} /> : <Fallback kind={channels.error!} />}
      {trends.data ? <Trends followers={trends.data.followers} engagement={trends.data.engagement} /> : <Fallback kind={trends.error!} />}
      {top.data ? <TopContent rows={top.data} /> : <Fallback kind={top.error!} />}
    </div>
  )
}
