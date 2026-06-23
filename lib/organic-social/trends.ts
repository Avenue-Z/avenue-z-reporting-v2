import { dashClientFor, isoRange, displayChannel, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, GraphMetric } from '@/lib/dash-social/types'
import type { TrendSeries, TrendPoint } from './types'

/** GRAPH shape: data[channelKey].metrics[metric][channelKey] = { [date]: value|null }. */
export function transformTrend(res: ReportsDataResponse<GraphMetric>, metric: string): TrendSeries {
  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const [channelKey, metrics] of channelMetricEntries(res)) {
    const daily = metrics[metric]?.[channelKey]   // inner key repeats the channel
    if (!daily) continue
    const label = displayChannel(channelKey)
    channels.push(label)
    for (const [date, value] of Object.entries(daily)) {
      const row = byDate.get(date) ?? ({ date } as TrendPoint)
      row[label] = value ?? 0
      byDate.set(date, row)
    }
  }
  const points = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  return { points, channels }
}

export async function getTrends(slug: string, dateRange: string): Promise<{ followers: TrendSeries; engagement: TrendSeries }> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getReportsData<GraphMetric>({
    brandId, channels, reportType: 'GRAPH', timeScale: 'DAILY',
    metrics: [METRICS.totalFollowers, METRICS.engagements],
    startDate: start, endDate: end,
  })
  return { followers: transformTrend(res, METRICS.totalFollowers), engagement: transformTrend(res, METRICS.engagements) }
}
