import { cache } from 'react'
import { buildTrendSeries } from './trend-series'
import { dashClientFor, isoRange, isoRangeTz } from './base'
import { CHANNEL_LABEL, metricForKey, resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
import { getGraphData } from './graph-guard'
import type { GraphMetric } from '@/lib/dash-social/types'
import type { DayWindow, TrendSeries } from './types'

// GRAPH (single channel) shape: data.metrics[METRIC].ALL_CHANNELS[date] = value|null.
// res.data carries both per-channel entries and a top-level `metrics` aggregate.
type GraphData = { metrics?: Record<string, GraphMetric> }

/** Scoped views surface a trend-channel failure; Overview drops it to a null series (then filtered). */
export const onTrendChannelError = (e: unknown, scoped: boolean, label: string): { label: string; daily: null } =>
  channelErrorPolicy(scoped, e, { label, daily: null })

/** `window` is optional and defaults to the Eastern window every existing caller gets. v1,
 *  which Renaissance renders, passes nothing; only engagement-trend@2 passes 'utc'. */
export const getEngagementTrend = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
  window: DayWindow = 'eastern',
): Promise<TrendSeries> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  const targets = resolveTargets(channels, channel)
  const scoped = channel != null
  const { start, end } = window === 'utc' ? isoRange(dateRange) : isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    targets.map(async (channel) => {
      const metric = metricForKey(channel, 'engagements')
      const label = CHANNEL_LABEL[channel]
      try {
        const res = await getGraphData<GraphMetric>(client, {
          brandId,
          channels: [channel],
          reportType: 'GRAPH',
          timeScale: 'DAILY',
          metrics: [metric],
          startDate: start,
          endDate: end,
        })
        const daily = (res.data as GraphData).metrics?.[metric]?.ALL_CHANNELS
        return { label, daily: daily ?? null }
      } catch (e) {
        return onTrendChannelError(e, scoped, label)
      }
    }),
  )

  return buildTrendSeries(perChannel)
})
