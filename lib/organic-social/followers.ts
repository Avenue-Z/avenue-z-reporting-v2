import { cache } from 'react'
import { buildTrendSeries } from './trend-series'
import { dashClientFor, isoRangeTz } from './base'
import { CHANNEL_LABEL, metricForKey, resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
import type { GraphMetric } from '@/lib/dash-social/types'
import type { TrendSeries } from './types'

// GRAPH (single channel) shape: data.metrics[METRIC].ALL_CHANNELS[date] = value|null.
type GraphData = { metrics?: Record<string, GraphMetric> }

/** Scoped views surface a follower-channel failure; Overview drops it to a null series (then filtered). */
export const onFollowerChannelError = (e: unknown, scoped: boolean, label: string): { label: string; daily: null } =>
  channelErrorPolicy(scoped, e, { label, daily: null })

/** Daily TOTAL_FOLLOWERS per channel (GRAPH/DAILY). Findings §3a: available on all four.
 *  TOTAL_FOLLOWERS is basis-neutral (identical both bases in PLATFORM_KPIS). */
export const getFollowerGraph = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
): Promise<TrendSeries> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  const targets = resolveTargets(channels, channel)
  const scoped = channel != null
  const { start, end } = isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    targets.map(async (channel) => {
      const metric = metricForKey(channel, 'followers') // TOTAL_FOLLOWERS
      const label = CHANNEL_LABEL[channel]
      try {
        const res = await client.getReportsData<GraphMetric>({
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
        return onFollowerChannelError(e, scoped, label)
      }
    }),
  )

  return buildTrendSeries(perChannel)
})
