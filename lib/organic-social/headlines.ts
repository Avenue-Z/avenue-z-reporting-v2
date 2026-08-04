import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { resolveTargets, channelErrorPolicy, OVERVIEW_KPI_KEYS, platformKpiKeys, type DashChannel } from './metrics'
import { buildPlatformHeadline, metricNamesFor } from './headline-build'
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
      // Overview → the five OVERVIEW_KPI_KEYS; a platform subpage → the channel's full set.
      const keys = scoped ? platformKpiKeys(channel) : [...OVERVIEW_KPI_KEYS]
      try {
        const res = await client.getReportsData<TotalMetric>({
          brandId,
          channels: [channel],
          reportType: 'TOTAL_GROUPED_METRIC',
          aggregateBy: 'BRAND',
          requirePosts: true,
          metrics: metricNamesFor(channel, keys),
          startDate: start,
          endDate: end,
          contextStartDate: ctx?.start,
          contextEndDate: ctx?.end,
        })
        const metrics = res.data?.[key]?.metrics
        if (!metrics) return null
        return buildPlatformHeadline(channel, metrics, keys, scoped)
      } catch (e) {
        return onChannelError(e, scoped)
      }
    }),
  )

  return results.filter((r): r is PlatformHeadline => r !== null)
})
