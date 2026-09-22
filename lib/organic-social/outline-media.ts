// The outline Data rows that need their own Dash request (Views on Reels today). One request per
// tab, only when the tab's rows show such a row; the tiles' request is unchanged.
import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { resolveTargets, type DashChannel } from './metrics'
import { delta } from './headline-build'
import { OUTLINE_MEDIA_KPIS, type MediaKpiSpec } from './outline-layout'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { HeadlineKpi } from './types'

type MediaData = Record<string, { metrics?: Record<string, { ALL_CHANNELS?: TotalMetric }> }> | undefined

/** Pure. A media type with no posts in the window is absent from Dash's answer: zero, no arrow.
 *  A 200 without the brand entry is a malformed answer: throw rather than show zero. */
export function buildMediaKpis(channel: DashChannel, data: MediaData, brandId: number, specs: MediaKpiSpec[]): Record<string, HeadlineKpi> {
  if (!data?.[String(brandId)]) throw new Error(`${channel}: Dash returned no media data for this brand`)
  const out: Record<string, HeadlineKpi> = {}
  for (const s of specs) {
    const m = data[s.mediaType]?.metrics?.[s.metric]?.ALL_CHANNELS
    out[s.key] = { key: s.key, label: s.label, format: 'number', value: m?.value ?? 0, delta: delta(m) }
  }
  return out
}

export const getOutlineMediaKpis = cache(async (
  slug: string, dateRange: string, compareRange: string | null, channel: DashChannel,
): Promise<Record<string, HeadlineKpi>> => {
  const specs = OUTLINE_MEDIA_KPIS[channel] ?? []
  const { client, brandId, channels } = await dashClientFor(slug)
  resolveTargets(channels, channel)
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<{ ALL_CHANNELS?: TotalMetric }>({
    brandId, channels: [channel], reportType: 'MULTI_METRIC_MEDIA_TYPE', requirePosts: true, // as the tiles; same value (probed)
    metrics: [...new Set(specs.map((s) => s.metric))],
    startDate: start, endDate: end, contextStartDate: ctx?.start, contextEndDate: ctx?.end,
  })
  return buildMediaKpis(channel, res.data as MediaData, brandId, specs)
})
