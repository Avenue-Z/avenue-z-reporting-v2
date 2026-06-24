import { dashClientFor, isoRangeTz } from './base'
import { CHANNELS, CHANNEL_LABEL, CHANNEL_METRICS } from './metrics'
import type { GraphMetric } from '@/lib/dash-social/types'
import type { TrendSeries, TrendPoint } from './types'

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

  const channels: string[] = []
  const byDate = new Map<string, TrendPoint>()
  for (const { label, daily } of perChannel) {
    if (!daily) continue
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
