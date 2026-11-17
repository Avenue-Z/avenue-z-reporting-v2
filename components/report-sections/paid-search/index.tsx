import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getHeroSeries } from '@/lib/paid-search/hero'
import { getCampaignRows } from '@/lib/paid-search/campaigns'
import { getLeadBreakdown } from '@/lib/paid-search/leads'
import { getGeoRows } from '@/lib/paid-search/geo'
import { getKeywordsData } from '@/lib/paid-search/keywords'
import { Hero } from './hero'
import { KpiGrid } from './kpi-grid'
import { CampaignTable } from './campaign-table'
import { LeadsSection } from './leads-section'
import { GeoSection } from './geo-section'
import { KeywordsTable } from './keywords'
import { SmTimeoutError } from '@/lib/supermetrics/client'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import { PaidMediaFallback } from '@/components/report-sections/paid-media/fallback'
import { DataDelayedNotice } from '@/components/report-sections/paid-media/data-delayed-notice'
import { googleAdsWindow } from '@/lib/bq/googleads-window'
import { bqEnabled } from '@/lib/bq/backend'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try {
    return { data: await p }
  } catch (e) {
    return { error: e instanceof SmTimeoutError ? 'timeout' : 'error' }
  }
}


export async function PaidSearchReport({
  clientSlug,
  dateRange = 'last_30_days',
  compareRange = null,
}: {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}) {
  // PRD: automatic prior-period comparison — default to previous_period when
  // the URL doesn't specify a compare mode (an explicit value still wins).
  const effectiveCompare = compareRange ?? 'previous_period'
  // On BigQuery the page shows only what the marts hold, never live (C3); `range` is that part of the range.
  const ads = await googleAdsWindow(clientSlug, dateRange)
  const range = ads.dateRange
  if (!range) {
    return (
      <div className="space-y-8">
        <SharedPartsHeader viewKey="paid-search" clientSlug={clientSlug} />
        <DataDelayedNotice notice={ads.notice} />
      </div>
    )
  }
  const [kpis, hero, campaigns, leads, geo, keywords] = await Promise.all([
    safe(getPaidSearchKpis(clientSlug, range, effectiveCompare)),
    // Hero follows the page date range (daily buckets for short ranges, weekly for long).
    safe(getHeroSeries(clientSlug, range)),
    safe(getCampaignRows(clientSlug, range)),
    safe(getLeadBreakdown(clientSlug, range)),
    safe(getGeoRows(clientSlug, range)),
    safe(getKeywordsData(clientSlug, range)),
  ])
  // On BigQuery a failed part is a warehouse miss with no live fallback, so the reader is told why.
  const failedOnBq = [kpis, hero, campaigns, leads, geo, keywords].some((p) => p.error) && bqEnabled('googleads', clientSlug)

  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="paid-search" clientSlug={clientSlug} />
      <DataDelayedNotice notice={ads.notice} />
      <DataDelayedNotice notice={failedOnBq ? { kind: 'unavailable' } : null} />
      {hero.data ? <Hero points={hero.data} /> : <PaidMediaFallback kind={hero.error!} />}
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <PaidMediaFallback kind={kpis.error!} />}
      {campaigns.data ? <CampaignTable rows={campaigns.data} /> : <PaidMediaFallback kind={campaigns.error!} />}
      {leads.data ? <LeadsSection data={leads.data} /> : <PaidMediaFallback kind={leads.error!} />}
      {geo.data ? <GeoSection rows={geo.data} /> : <PaidMediaFallback kind={geo.error!} />}
      {keywords.data ? <KeywordsTable data={keywords.data} /> : <PaidMediaFallback kind={keywords.error!} />}
    </div>
  )
}
