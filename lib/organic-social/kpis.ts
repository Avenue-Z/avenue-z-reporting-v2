import { dashClientFor, isoRange, resolveCompareIso, channelMetricEntries } from './base'
import { METRICS } from './metrics'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'
import type { OrganicKpi } from './types'

/** Sum a metric's value + context across CHANNEL entries (BRAND entry skipped by channelMetricEntries). */
function sumMetric(res: ReportsDataResponse<TotalMetric>, metric: string): { value: number; context: number } {
  let value = 0, context = 0
  for (const [, metrics] of channelMetricEntries(res)) {
    const v = metrics[metric]
    if (v) { value += v.value ?? 0; context += v.context ?? 0 }
  }
  return { value, context }
}
function delta(cur: number, prev: number): number | undefined {
  if (!prev) return undefined
  return ((cur - prev) / prev) * 100
}

export function transformKpis(res: ReportsDataResponse<TotalMetric>): OrganicKpi[] {
  const followers = sumMetric(res, METRICS.totalFollowers)
  const netNew = sumMetric(res, METRICS.netNewFollowers)
  const impressions = sumMetric(res, METRICS.impressions)
  const engagements = sumMetric(res, METRICS.engagements)
  const engRate = impressions.value ? +((engagements.value / impressions.value) * 100).toFixed(1) : 0
  return [
    { key: 'totalFollowers', label: 'Total Followers', value: followers.value, delta: delta(followers.value, followers.context) },
    { key: 'netNewFollowers', label: 'Net New Followers', value: netNew.value, delta: delta(netNew.value, netNew.context) },
    { key: 'impressions', label: 'Views / Impressions', value: impressions.value },
    { key: 'engagements', label: 'Total Engagements', value: engagements.value, delta: delta(engagements.value, engagements.context) },
    { key: 'engagementRate', label: 'Engagement Rate', value: engRate, suffix: '%', tooltip: 'Engagements ÷ impressions' },
  ]
}

export async function getOrganicKpis(slug: string, dateRange: string, compareRange: string | null): Promise<OrganicKpi[]> {
  const { client, brandId, channels } = await dashClientFor(slug)
  const { start, end } = isoRange(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId, channels, reportType: 'TOTAL_METRIC',
    metrics: [METRICS.totalFollowers, METRICS.netNewFollowers, METRICS.impressions, METRICS.engagements],
    startDate: start, endDate: end,
    contextStartDate: ctx?.start, contextEndDate: ctx?.end,
  })
  return transformKpis(res)
}
