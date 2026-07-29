import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
import { buildPlatformHeadline, overviewMetricNames } from './headline-build'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { PlatformHeadline } from './types'

/** Scoped (single-channel) views surface Dash failures as errors; Overview drops the bad channel. */
export const onChannelError = (e: unknown, scoped: boolean): null => channelErrorPolicy(scoped, e, null)

export const getPlatformHeadlines = cache(async (
  slug: string,
  dateRange: string,
  compareRange: string | null,
  channel: DashChannel | null = null,
): Promise<PlatformHeadline[]> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  const targets = resolveTargets(channels, channel)
  const scoped = channel != null
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const key = String(brandId)

  const results = await Promise.all(
    targets.map(async (channel): Promise<PlatformHeadline | null> => {
      try {
        const res = await client.getReportsData<TotalMetric>({
          brandId,
          channels: [channel],
          reportType: 'TOTAL_GROUPED_METRIC',
          aggregateBy: 'BRAND',
          requirePosts: true,
          metrics: overviewMetricNames(channel),
          startDate: start,
          endDate: end,
          contextStartDate: ctx?.start,
          contextEndDate: ctx?.end,
        })
        const metrics = res.data?.[key]?.metrics
        if (!metrics) return null
        return buildPlatformHeadline(channel, metrics)
      } catch (e) {
        return onChannelError(e, scoped)
      }
    }),
  )

  return results.filter((r): r is PlatformHeadline => r !== null)
})
