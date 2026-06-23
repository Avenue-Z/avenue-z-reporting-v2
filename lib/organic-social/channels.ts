import { dashClientFor, isoRange, displayChannel, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'
import type { ChannelRow } from './types'

const val = (v: TotalMetric | undefined): number => v?.value ?? 0

export function transformChannels(res: ReportsDataResponse<TotalMetric>): ChannelRow[] {
  return channelMetricEntries(res).map(([channel, metrics]) => {
    const engagements = val(metrics[METRICS.engagements])
    const impressions = val(metrics[METRICS.impressions])
    return {
      channel: displayChannel(channel),
      followers: val(metrics[METRICS.totalFollowers]),
      netNewFollowers: val(metrics[METRICS.netNewFollowers]),
      engagements,
      engagementRate: impressions ? +((engagements / impressions) * 100).toFixed(1) : 0,
    }
  })
}

export async function getChannelRows(slug: string, dateRange: string): Promise<ChannelRow[]> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId, channels, reportType: 'TOTAL_METRIC',
    metrics: [METRICS.totalFollowers, METRICS.netNewFollowers, METRICS.engagements, METRICS.impressions],
    startDate: start, endDate: end,
  })
  return transformChannels(res)
}
