import { getMetaKpis } from '@/lib/meta/kpis'
import { getCreativeTree } from '@/lib/meta/creative'
import { getMetaGeoData } from '@/lib/meta/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { CreativeTable } from './creative-table'
import { MetaGeoSection } from './geo-section'
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


export async function MetaAdsReport({
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
    safe(getMetaKpis(clientSlug, dateRange, compare)),
    safe(getCreativeTree(clientSlug, dateRange)),
    safe(getMetaGeoData(clientSlug, dateRange, compare)),
  ])

  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="meta-ads" clientSlug={clientSlug} />
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <PaidMediaFallback kind={kpis.error!} />}
      {creative.data ? <CreativeTable campaigns={creative.data} /> : <PaidMediaFallback kind={creative.error!} />}
      {geo.data ? <MetaGeoSection data={geo.data} /> : <PaidMediaFallback kind={geo.error!} />}
    </div>
  )
}
