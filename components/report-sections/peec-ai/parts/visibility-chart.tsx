import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { VisibilityChart } from '../visibility-chart'

export const visibilityChartV1: PartImpl<PeecCtx> = {
  id: 'visibility-chart',
  version: 1,
  published: true,
  defaultLabel: 'Visibility Over Time',
  render: (ctx) => {
    const { data, brandName } = ctx
    if (data.dailyVisibility.length === 0) return null
    return (
      <VisibilityChart
        data={data.dailyVisibility}
        competitorData={data.competitorDailyVisibility}
        brandName={brandName}
      />
    )
  },
}
