import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { getOutlineKpis, selectOutlineRows } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS, type OutlineRow, type OutlineVariant } from '@/lib/organic-social/outline-layout'
import { PlatformHeadlines } from '../platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { safe, Fallback } from './shared'

export async function OutlineDataSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const r = await safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel).then((b) => selectOutlineRows(channel, b, rows)))
  return r.data ? <PlatformHeadlines headlines={[r.data]} /> : <Fallback kind={r.error!} />
}

/** The Data block as a client's outline defines it. On Overview, or a channel no outline covers,
 *  it is v1 unchanged. Unpublished: pinned per client, never promoted into the shared template. */
function outlineData(version: number, variant: OutlineVariant): PartImpl<OrganicSocialCtx> {
  return {
    id: 'platform-headlines',
    version,
    published: false,
    defaultLabel: 'Platform Headlines',
    render: (ctx, resolved) => {
      const rows = ctx.channel ? OUTLINE_DATA_ROWS[variant][ctx.channel] : undefined
      if (!ctx.channel || !rows) return platformHeadlinesV1.render(ctx, resolved)
      return (
        <Suspense fallback={<HeadlinesSkeleton />}>
          <OutlineDataSection ctx={ctx} channel={ctx.channel} rows={rows} />
        </Suspense>
      )
    },
  }
}

/** The outline's standard rows (A Place For Mom, Joy of Life). */
export const platformHeadlinesV2 = outlineData(2, 'standard')
/** The same with Profile Clicks in place of Video Views on Instagram (Kenect Nashville). */
export const platformHeadlinesV3 = outlineData(3, 'profileClicks')
