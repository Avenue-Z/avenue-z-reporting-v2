import { buildTrendSeries } from './trend-series'
import { dashClientFor, isoRangeTz } from './base'
import { CHANNELS, CHANNEL_LABEL, CHANNEL_METRICS } from './metrics'
import type { GraphMetric } from '@/lib/dash-social/types'
import type { TrendSeries } from './types'

// GRAPH (single channel) shape: data.metrics[METRIC].ALL_CHANNELS[date] = value|null.
// res.data carries both per-channel entries and a top-level `metrics` aggregate.
type GraphData = { metrics?: Record<string, GraphMetric> }

export async function getEngagementTrend(slug: string, dateRange: string): Promise<TrendSeries> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    CHANNELS.map(async (channel) => {
      const metric = CHANNEL_METRICS[channel].engagements
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
        return { label: CHANNEL_LABEL[channel], daily: daily ?? null }
      } catch {
        return { label: CHANNEL_LABEL[channel], daily: null }
      }
    }),
  )

  return buildTrendSeries(perChannel)
}

export async function getFollowerTrend(slug: string, dateRange: string): Promise<TrendSeries> {
  const { client, brandId } = await dashClientFor(slug)
  const { start, end } = isoRangeTz(dateRange)

  const perChannel = await Promise.all(
    CHANNELS.map(async (channel) => {
      const metric = CHANNEL_METRICS[channel].followers
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
        return { label: CHANNEL_LABEL[channel], daily: daily ?? null }
      } catch {
        return { label: CHANNEL_LABEL[channel], daily: null }
      }
    }),
  )

  return buildTrendSeries(perChannel)
}
