import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { CHANNELS, CHANNEL_LABEL, CHANNEL_METRICS } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { PlatformHeadline } from './types'

/** Prior-period percent change from a Dash metric's value vs. its context, or undefined. */
function delta(m: TotalMetric | undefined): number | undefined {
  if (!m) return undefined
  const cur = m.value ?? 0
  const prev = m.context
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / prev) * 100
}

function pruneDeltas(d: PlatformHeadline['deltas']): PlatformHeadline['deltas'] {
  if (!d) return undefined
  const has = Object.values(d).some((v) => v !== undefined)
  return has ? d : undefined
}

export const getPlatformHeadlines = cache(async (
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<PlatformHeadline[]> => {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const key = String(brandId)

  const results = await Promise.all(
    CHANNELS.map(async (channel): Promise<PlatformHeadline | null> => {
      const map = CHANNEL_METRICS[channel]
      try {
        const res = await client.getReportsData<TotalMetric>({
          brandId,
          channels: [channel],
          reportType: 'TOTAL_GROUPED_METRIC',
          aggregateBy: 'BRAND',
          requirePosts: true,
          metrics: [map.followers, map.netNewFollowers, map.exposure, map.engagements, map.engagementRate],
          startDate: start,
          endDate: end,
          contextStartDate: ctx?.start,
          contextEndDate: ctx?.end,
        })
        const metrics = res.data?.[key]?.metrics
        if (!metrics) return null

        const followers = metrics[map.followers]
        const netNew = metrics[map.netNewFollowers]
        const exposure = metrics[map.exposure]
        const engagements = metrics[map.engagements]
        const engagementRate = metrics[map.engagementRate]

        const deltas = pruneDeltas({
          followers: delta(followers),
          netNewFollowers: delta(netNew),
          exposure: delta(exposure),
          engagements: delta(engagements),
          engagementRate: delta(engagementRate),
        })

        return {
          channel,
          label: CHANNEL_LABEL[channel],
          exposureLabel: map.exposureLabel,
          followers: followers?.value ?? 0,
          netNewFollowers: netNew?.value ?? 0,
          exposure: exposure?.value ?? 0,
          engagements: engagements?.value ?? 0,
          engagementRate: (engagementRate?.value ?? 0) * 100,
          deltas,
        }
      } catch {
        return null
      }
    }),
  )

  return results.filter((r): r is PlatformHeadline => r !== null)
})
