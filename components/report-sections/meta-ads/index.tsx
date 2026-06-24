import { getMetaKpis } from '@/lib/meta/kpis'
import { getCreativeRows } from '@/lib/meta/creative'
import { getMetaGeoData } from '@/lib/meta/geo'
import { KpiGrid } from '@/components/report-sections/paid-search/kpi-grid'
import { CreativeTable } from './creative-table'
import { MetaGeoSection } from './geo-section'
import { SmTimeoutError } from '@/lib/supermetrics/client'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try {
    return { data: await p }
  } catch (e) {
    return { error: e instanceof SmTimeoutError ? 'timeout' : 'error' }
  }
}

function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout'
        ? 'Taking longer than usual — try a shorter date range.'
        : "Couldn't load this section."}
    </div>
  )
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
    safe(getCreativeRows(clientSlug, dateRange)),
    safe(getMetaGeoData(clientSlug, dateRange, compare)),
  ])

  return (
    <div className="space-y-8">
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {creative.data ? <CreativeTable rows={creative.data} /> : <Fallback kind={creative.error!} />}
      {geo.data ? <MetaGeoSection data={geo.data} /> : <Fallback kind={geo.error!} />}
    </div>
  )
}
