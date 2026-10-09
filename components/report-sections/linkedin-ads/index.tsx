import { getLinkedInKpis } from '@/lib/linkedin/kpis'
import { getCreativeTree } from '@/lib/linkedin/creative'
import { getLinkedInGeoRows } from '@/lib/linkedin/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { LinkedInCreativeTable } from './creative-table'
import { LinkedInGeoSection } from './geo-section'
import { SmTimeoutError } from '@/lib/supermetrics/client'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { PaidMediaFallback } from '@/components/report-sections/paid-media/fallback'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try {
    return { data: await p }
  } catch (e) {
    return { error: e instanceof SmTimeoutError ? 'timeout' : 'error' }
  }
}


export async function LinkedInAdsReport({
  clientSlug,
  dateRange = 'last_30_days',
  compareRange = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}) {
  const compare = compareRange ?? 'previous_period'
  const [kpis, creative, geo] = await Promise.all([
    safe(getLinkedInKpis(clientSlug, dateRange, compare)),
    safe(getCreativeTree(clientSlug, dateRange)),
    safe(getLinkedInGeoRows(clientSlug, dateRange)),
  ])

  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="linkedin-ads" clientSlug={clientSlug} />
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <PaidMediaFallback kind={kpis.error!} />}
      {creative.data ? <LinkedInCreativeTable groups={creative.data} /> : <PaidMediaFallback kind={creative.error!} />}
      {geo.data ? <LinkedInGeoSection rows={geo.data} /> : <PaidMediaFallback kind={geo.error!} />}
    </div>
  )
}
