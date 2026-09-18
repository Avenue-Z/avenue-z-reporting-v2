// The outline parts' data (platform-headlines@2/@3, engagement-breakdown@1). One Dash request per
// tab for the channel's shared tile metrics plus its outline extras, in the same request shape as
// getPlatformHeadlines, and built by the same rules as buildPlatformHeadline. Both parts call
// getOutlineKpis with the same arguments, so React's cache makes it one request per tab.
import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { CHANNEL_LABEL, metricFor, resolveTargets, type DashChannel, type KpiSpec } from './metrics'
import { delta } from './headline-build'
import { outlineSpecsFor, type OutlineRow } from './outline-layout'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { HeadlineKpi, PlatformHeadline } from './types'

export type OutlineKpis = { kpis: Record<string, HeadlineKpi>; noData: boolean }

/** Pure. A requested metric missing from a 200 is a malformed payload: throw rather than show a
 *  made-up zero. Every metric present but null is a window with no data. */
export function buildOutlineKpis(
  channel: DashChannel,
  metrics: Record<string, TotalMetric>,
  specs: readonly KpiSpec[],
): OutlineKpis {
  const named = specs.map((spec) => ({ spec, metric: metricFor(spec) }))
  const absent = named.filter(({ metric }) => !(metric in metrics)).map(({ metric }) => metric)
  if (absent.length) throw new Error(`${channel}: Dash omitted requested metric(s): ${absent.join(', ')}`)
  const noData = named.every(({ metric }) => metrics[metric]?.value == null)
  const kpis: Record<string, HeadlineKpi> = {}
  for (const { spec, metric } of named) {
    const m = metrics[metric]
    const raw = m?.value ?? 0
    kpis[spec.key] = {
      key: spec.key,
      label: spec.label,
      format: spec.format,
      value: spec.format === 'percent' ? raw * 100 : raw,
      delta: delta(m),
      footnote: spec.footnote, // outline tabs are always one channel, where footnotes show
    }
  }
  return { kpis, noData }
}

/** The rows, in order, under the outline's labels, as the tile component's PlatformHeadline. */
export function selectOutlineRows(channel: DashChannel, built: OutlineKpis, rows: readonly OutlineRow[]): PlatformHeadline {
  const kpis = rows.map((r) => {
    const k = built.kpis[r.key]
    if (!k) throw new Error(`${channel}: no tile for outline row '${r.key}'`)
    return { ...k, label: r.label }
  })
  return { channel, label: CHANNEL_LABEL[channel], kpis, noData: built.noData }
}

export const getOutlineKpis = cache(async (
  slug: string,
  dateRange: string,
  compareRange: string | null,
  channel: DashChannel,
): Promise<OutlineKpis> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  resolveTargets(channels, channel) // a tab outside the client's allowlist throws, as the tiles do
  const specs = outlineSpecsFor(channel)
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId,
    channels: [channel],
    reportType: 'TOTAL_GROUPED_METRIC',
    aggregateBy: 'BRAND',
    requirePosts: true,
    metrics: specs.map(metricFor),
    startDate: start,
    endDate: end,
    contextStartDate: ctx?.start,
    contextEndDate: ctx?.end,
  })
  const metrics = res.data?.[String(brandId)]?.metrics
  if (!metrics) throw new Error(`${channel}: Dash returned no metrics for this brand`)
  return buildOutlineKpis(channel, metrics, specs)
})
