import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { getOutlineKpis, selectOutlineRows, type OutlineHeadline } from '@/lib/organic-social/outline-headlines'
import { getOutlineMediaKpis } from '@/lib/organic-social/outline-media'
import { MEDIA_FAILED, OUTLINE_DATA_ROWS, mediaRowsFor, type OutlineRow, type OutlineVariant } from '@/lib/organic-social/outline-layout'
import { OutlineHeadlines } from '../outline-tiles'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { safe, Fallback } from './shared'

/** The tiles' request, plus Views on Reels when the rows show it. A failed Reels request flags only
 *  its row; a failed tiles request (or a row with no tile) is the section's fallback card, as today. */
export async function OutlineDataSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const media = mediaRowsFor(channel, rows)
  const [r, m] = await Promise.all([
    safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)),
    media.length ? safe(getOutlineMediaKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)) : safe(Promise.resolve({})),
  ])
  if (!r.data) return <Fallback kind={r.error!} />
  if (!m.data) console.error(`[organic-social] Views on Reels failed slug=${ctx.clientSlug} channel=${channel} kind=${m.error}`)
  const failed = new Set(m.data ? [] : media.map((x) => x.key))
  const shown = rows.map((row) => (failed.has(row.key) ? { ...row, unavailable: MEDIA_FAILED } : row))
  const built = { ...r.data, kpis: { ...r.data.kpis, ...(m.data ?? {}) } }
  let headline: OutlineHeadline
  try { headline = selectOutlineRows(channel, built, shown) } catch { return <Fallback kind="error" /> }
  return <OutlineHeadlines headline={headline} />
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
