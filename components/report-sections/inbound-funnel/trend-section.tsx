/**
 * Daily contacts trend chart. Needs main + (optional) compare range
 * daily series from HubSpot.
 */
import { getDailyContactTrend } from '@/lib/hubspot/client'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { ContactsTrendChart } from './ytd-contact-chart'
import { fmtISODate } from './_utils'

interface Props {
  clientSlug:    string
  dateRange:     string
  compareRange:  string | null
}

export async function TrendSection({ clientSlug, dateRange, compareRange }: Props) {
  const main    = parseDateRange(dateRange)
  const compare = deriveCompareRange(dateRange, compareRange)

  const mainTrend    = await getDailyContactTrend(clientSlug, main.startDate, main.endDate)
  const compareTrend = compare
    ? await getDailyContactTrend(clientSlug, compare.startDate, compare.endDate)
    : null

  if (mainTrend.length === 0) return null

  const chartData = mainTrend.map((row, i) => {
    const prev = compareTrend?.[i]
    return {
      date:  row.date,
      total: row.total,
      icp:   row.icp,
      mcp:   row.mcp,
      ...(prev && {
        prevDate:  prev.date,
        prevTotal: prev.total,
        prevIcp:   prev.icp,
        prevMcp:   prev.mcp,
      }),
    }
  })

  const compareDateLabel = compare
    ? `${fmtISODate(compare.startDate)} – ${fmtISODate(compare.endDate)}`
    : undefined

  return <ContactsTrendChart data={chartData} compareLabel={compareDateLabel} />
}
