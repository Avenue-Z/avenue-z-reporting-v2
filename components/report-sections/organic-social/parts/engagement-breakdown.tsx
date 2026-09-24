import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { getOutlineKpis, selectOutlineRows } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_BREAKDOWN_ROWS, type OutlineRow } from '@/lib/organic-social/outline-layout'
import { OutlineTiles } from '../outline-tiles'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

export async function BreakdownSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const r = await safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel).then((b) => selectOutlineRows(channel, b, rows)))
  if (!r.data) return <Fallback kind={r.error!} />
  // No data: the Data block above already says so, once.
  return r.data.noData ? null : <OutlineTiles kpis={r.data.kpis} />
}

function BreakdownSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[0, 1, 2, 3, 4].map((c) => (
        <div key={c} className="h-[76px] animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
      ))}
    </div>
  )
}

/** The engagement metrics the outlines put directly under the engagement graph. Pinned per client
 *  after engagement-trend; unpublished. Renders nothing on Overview or an uncovered channel. */
export const engagementBreakdownV1: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-breakdown',
  version: 1,
  published: false,
  defaultLabel: 'Engagement Breakdown',
  render: (ctx) => {
    const rows = ctx.channel ? OUTLINE_BREAKDOWN_ROWS[ctx.channel] : undefined
    if (!ctx.channel || !rows) return null
    return (
      <Suspense fallback={<BreakdownSkeleton />}>
        <BreakdownSection ctx={ctx} channel={ctx.channel} rows={rows} />
      </Suspense>
    )
  },
}
