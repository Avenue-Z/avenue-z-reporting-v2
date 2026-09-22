import { cache } from 'react'
import { buildTrendSeries } from './trend-series'
import { dashClientFor, isoRange, isoRangeTz } from './base'
import { CHANNEL_LABEL, metricForKey, resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
import type { GraphMetric } from '@/lib/dash-social/types'
import type { DayWindow, TrendSeries } from './types'

// GRAPH (single channel) shape: data.metrics[METRIC].ALL_CHANNELS[date] = value|null.
type GraphData = { metrics?: Record<string, GraphMetric> }

/** Scoped views surface a follower-channel failure; Overview drops it to a null series (then filtered). */
export const onFollowerChannelError = (e: unknown, scoped: boolean, label: string): { label: string; daily: null } =>
  channelErrorPolicy(scoped, e, { label, daily: null })

export type FollowerKey = 'followers' | 'netNewFollowers'

/** Daily TOTAL_FOLLOWERS per channel (GRAPH/DAILY). Findings §3a: available on all four.
 *  TOTAL_FOLLOWERS is basis-neutral (identical both bases in PLATFORM_KPIS).
 *
 *  `key` and `window` are optional and default to exactly what every existing caller gets:
 *  total followers over the Eastern window. v1 of the follower graph, which Renaissance
 *  renders, passes neither. Only follower-graph@2 passes 'netNewFollowers' and 'utc',
 *  because the team's Follower Growth chart plots daily gains. React's cache keys on every
 *  argument and the Dash request is cached by URL, so v1 and v2 never share a result. */
export const getFollowerGraph = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
  key: FollowerKey = 'followers',
  window: DayWindow = 'eastern',
): Promise<TrendSeries> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  const targets = resolveTargets(channels, channel)
  const scoped = channel != null
  const { start, end } = window === 'utc' ? isoRange(dateRange) : isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    targets.map(async (channel) => {
      const metric = metricForKey(channel, key) // TOTAL_FOLLOWERS unless v2 asks for NET_NEW_FOLLOWERS
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

  // TOTAL_FOLLOWERS is a STOCK, not a flow: a missing day must hold the last known
  // count, never plot a fabricated 0 (the "don't fabricate a zero" hazard the headline
  // builder throws to avoid). gapFill:'carry' does exactly that. NET_NEW_FOLLOWERS is a
  // flow, like daily engagements, so a missing day is 0.
  return buildTrendSeries(perChannel, { gapFill: key === 'followers' ? 'carry' : 'zero' })
})
