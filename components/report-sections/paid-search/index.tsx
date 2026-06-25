import { getPaidSearchKpis } from '@/lib/paid-search/kpis'
import { getHeroSeries } from '@/lib/paid-search/hero'
import { getCampaignRows } from '@/lib/paid-search/campaigns'
import { getLeadBreakdown } from '@/lib/paid-search/leads'
import { getGeoRows } from '@/lib/paid-search/geo'
import { getKeywordRows } from '@/lib/paid-search/keywords'
import { Hero } from './hero'
import { KpiGrid } from './kpi-grid'
import { CampaignTable } from './campaign-table'
import { LeadsSection } from './leads-section'
import { GeoSection } from './geo-section'
import { KeywordsTable } from './keywords'
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
  const [kpis, hero, campaigns, leads, geo, keywords] = await Promise.all([
    safe(getPaidSearchKpis(clientSlug, dateRange, effectiveCompare)),
    // Spec §6.1: hero is always weekly year-to-date, independent of the page range.
    safe(getHeroSeries(clientSlug, 'year_to_date')),
    safe(getCampaignRows(clientSlug, dateRange)),
    safe(getLeadBreakdown(clientSlug, dateRange)),
    safe(getGeoRows(clientSlug, dateRange)),
    safe(getKeywordRows(clientSlug, dateRange)),
  ])

  return (
    <div className="space-y-8">
      {hero.data ? <Hero points={hero.data} /> : <Fallback kind={hero.error!} />}
      {kpis.data ? <KpiGrid kpis={kpis.data} /> : <Fallback kind={kpis.error!} />}
      {campaigns.data ? <CampaignTable rows={campaigns.data} /> : <Fallback kind={campaigns.error!} />}
      {leads.data ? <LeadsSection data={leads.data} /> : <Fallback kind={leads.error!} />}
      {geo.data ? <GeoSection rows={geo.data} /> : <Fallback kind={geo.error!} />}
      {keywords.data ? <KeywordsTable rows={keywords.data} /> : <Fallback kind={keywords.error!} />}
    </div>
  )
}
