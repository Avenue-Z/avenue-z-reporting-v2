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
/** A row Dash does not offer: no value at all, shown blank with its flag. `value: null` keeps it
 *  from type-checking as a HeadlineKpi, so it can never reach a component that would print a number. */
export type FlaggedKpi = { key: string; label: string; format: 'number'; value: null; unavailable: string }
/** A tile of an outline tab: a real tile, or a flagged row. */
export type OutlineKpi = (HeadlineKpi & { unavailable?: undefined }) | FlaggedKpi
export type OutlineHeadline = Omit<PlatformHeadline, 'kpis'> & { kpis: OutlineKpi[] }

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

/** The rows, in order, under the outline's labels. A flagged row has no tile behind it: it becomes
 *  a FlaggedKpi, shown blank with its flag. */
export function selectOutlineRows(channel: DashChannel, built: OutlineKpis, rows: readonly OutlineRow[]): OutlineHeadline {
  const kpis = rows.map((r): OutlineKpi => {
    if (r.unavailable) return { key: r.key, label: r.label, format: 'number', value: null, unavailable: r.unavailable }
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
  // Not an empty state. Probed live 2026-09-22 with this exact request (28 GETs: a channel the brand
  // has no account on, zero-post windows, a future month, one-day windows): Dash always returned the
  // brand entry with every requested metric, and an empty window came back all null (noData). So a
  // missing entry is a malformed answer and the error card is right. (#254's absent key was the GRAPH
  // report, which differs.)
  if (!metrics) throw new Error(`${channel}: Dash returned no metrics for this brand`)
  return buildOutlineKpis(channel, metrics, specs)
})
