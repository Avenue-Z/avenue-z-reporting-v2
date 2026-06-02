/**
 * Lifecycle funnel + source × quality breakdown. Two independent
 * HubSpot fetches grouped because they're the bottom of the page
 * and finish around the same time.
 */
import { getLifecycleStageCounts, getContactBreakdown } from '@/lib/hubspot/client'
import { parseDateRange } from '@/lib/ga4/client'
import { LifecycleFunnel }    from './lifecycle-funnel'
import { SourceQualityTable } from './source-quality-table'

interface Props {
  clientSlug: string
  dateRange:  string
}

export async function FunnelAndSourceSection({ clientSlug, dateRange }: Props) {
  const main = parseDateRange(dateRange)

  const lifecycle = await getLifecycleStageCounts(clientSlug, main.startDate, main.endDate)
  const breakdown = await getContactBreakdown(clientSlug)

  return (
    <div className="space-y-8">
      <LifecycleFunnel stages={lifecycle} />
      {breakdown.length > 0 && <SourceQualityTable data={breakdown} />}
      <p className="text-xs text-text-muted">Live data from HubSpot CRM</p>
    </div>
  )
}
