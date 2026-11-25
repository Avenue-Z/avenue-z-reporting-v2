import { getMetaKpis } from '@/lib/meta/kpis'
import { getCreativeTree } from '@/lib/meta/creative'
import { getMetaGeoData } from '@/lib/meta/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { CreativeTable } from './creative-table'
import { MetaGeoSection } from './geo-section'
import { SmTimeoutError } from '@/lib/supermetrics/client'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { PaidMediaFallback } from '@/components/report-sections/paid-media/fallback'
import { DataDelayedNotice } from '@/components/report-sections/paid-media/data-delayed-notice'
import { metaWindow } from '@/lib/bq/meta-window'
import { bqEnabled } from '@/lib/bq/backend'
import { reachNotice } from '@/lib/bq/reach'

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
  // On BigQuery the page shows only what the marts hold, never live (C2, as Paid Search in C3); `range` is that part of the range.
  const meta = await metaWindow(clientSlug, dateRange)
  const range = meta.dateRange
  if (!range) {
    return (
      <div className="space-y-8">
        <SharedPartsHeader viewKey="meta-ads" clientSlug={clientSlug} />
        <DataDelayedNotice notice={meta.notice} source="Meta" />
      </div>
    )
  }
  const [kpis, creative, geo] = await Promise.all([
    safe(getMetaKpis(clientSlug, range, compare)),
    safe(getCreativeTree(clientSlug, range)),
    safe(getMetaGeoData(clientSlug, range, compare)),
  ])
  // On BigQuery a failed part is a warehouse miss with no live fallback, so the reader is told why.
  const failedOnBq = [kpis, creative, geo].some((p) => p.error) && bqEnabled('meta', clientSlug)

  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="meta-ads" clientSlug={clientSlug} />
      <DataDelayedNotice notice={meta.notice} source="Meta" />
      <DataDelayedNotice notice={failedOnBq ? { kind: 'unavailable' } : null} source="Meta" />
      <DataDelayedNotice notice={reachNotice(kpis.data)} source="Meta" />
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <PaidMediaFallback kind={kpis.error!} />}
      {creative.data ? <CreativeTable campaigns={creative.data} /> : <PaidMediaFallback kind={creative.error!} />}
      {geo.data ? <MetaGeoSection data={geo.data} /> : <PaidMediaFallback kind={geo.error!} />}
    </div>
  )
}
