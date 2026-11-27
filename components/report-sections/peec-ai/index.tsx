import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview } from '@/lib/peec/client'
import { getProfoundOverview } from '@/lib/profound/client'
import { getProfoundSentimentKpi } from '@/lib/profound/sentiment-kpi'
import type { ProfoundOverview } from '@/lib/profound/client'
import { ProviderTabs, type AeoProvider } from './provider-tabs'
import { fetchAiKpiWindow, type Ga4KpiState } from '@/lib/ga4/ai-kpis'
import { readSavedKpis } from '@/lib/report-sections/aeo-kpis'
import { KPI_CATALOG, effectiveKpis } from './v2/kpi-catalog'
import type { KpiInputs } from './ctx'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { GA4Row } from '@/lib/ga4/types'
import { isAiSource, aiSourceModel } from '@/lib/constants'
import type { ReportAudience } from './ctx'
import type { AEOModel } from '@/lib/peec/models'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { SectionHeader } from './section-header'
import { buildPeecCtx } from './ctx'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'
import { peecWrapsAsBlock } from './parts/export-layout'
import type { SectionOverride } from '@/lib/report-sections/types'
import { V2_PART_SECTIONS, isV2Layout, groupParts, sectionsPresent } from './v2/sections'
import { overviewCompare, type AeoCompare } from './v2/compare'
import { OverviewBody } from './v2/overview-body'
import { OverviewSectionNav } from './v2/section-nav'
import { DeltasSwitch } from './v2/deltas-switch'
import { kpiStripHidden } from './parts/kpi-cards.v2'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'

// --- Per-provider section (shared markup; renders via parts registry) ---

type Overview = PeecOverview | ProfoundOverview

const registry = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)

export function ProviderSection({
  data,
  provider,
  models = null,
  aiTraffic,
  clientSlug,
  dateRange,
  template,
  override,
  audience,
  compare,
  showDeltas,
  kpi,
}: {
  data: Overview
  provider: AeoProvider
  models?: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
  template: typeof PEEC_TEMPLATE
  override: SectionOverride | undefined
  audience: ReportAudience
  compare: AeoCompare
  showDeltas: boolean
  kpi?: KpiInputs
}) {
  const ctx = buildPeecCtx({ data, provider, models: models ?? null, aiTraffic, clientSlug, dateRange, audience, compare, showDeltas, kpi })
  const resolvedAll = resolveSection(template, override)
  // The layout (v1 or v2) is decided from every part. A client whose Snapshot KPI strip would be empty only loses
  // section 01 and its nav entry; the page stays v2.
  const resolved = resolvedAll.filter((r) => !(r.id === 'kpi-cards' && r.version === 2 && kpiStripHidden(ctx)))

  const renderPart = (r: (typeof resolved)[number]): ReactNode => {
    const impl = lookup(registry, r.id, r.version)
    // A part with no export form of its own is one unbreakable block in the PDF export (parts/export-layout.ts).
    return impl ? <div key={`${r.id}@${r.version}`} {...(peecWrapsAsBlock(r.id, r.version) ? { 'data-export-block': '' } : {})}>{impl.render(ctx, r)}</div> : null
  }

  if (isV2Layout(resolvedAll, V2_PART_SECTIONS)) {
    const groups = groupParts(resolved, V2_PART_SECTIONS)
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Suspense fallback={null}>
            <DeltasSwitch showDeltas={showDeltas} disabled={compare === 'none'} />
          </Suspense>
        </div>
        <div className="lg:grid lg:grid-cols-[180px_1fr] lg:gap-8">
          <Suspense fallback={null}>
            <OverviewSectionNav sections={sectionsPresent(groups)} />
          </Suspense>
          <OverviewBody groups={groups} renderPart={renderPart} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        icon={Sparkles}
        title="How visible is the brand across AI answer engines?"
      />
      {resolved.map(renderPart)}
    </div>
  )
}

// --- Main report ---

export async function PeecAIReport({
  clientSlug,
  dateRange,
  models = null,
  audience,
  compareRange,
  deltas,
}: { clientSlug?: string; dateRange?: string; models?: AEOModel[] | null; audience: ReportAudience; compareRange?: string | null; deltas?: string | null }) {
  const config = clientSlug ? await getClientBySlug(clientSlug) : null
  // Template + override first: whether the layout is v2 decides which compare window the fetchers use.
  const dbTemplate = await getSectionTemplate('peec-ai')
  const template = dbTemplate ?? PEEC_TEMPLATE
  const override = config?.reportSectionConfig?.['peec-ai']
  const resolvedLayout = resolveSection(template, override)
  const { compare, showDeltas, fetchMode } = overviewCompare(isV2Layout(resolvedLayout, V2_PART_SECTIONS), compareRange, deltas)
  const peecConfigured = !!config?.peecCustomerProjectId
  const profoundConfigured = !!config?.profoundCategoryId

  // GA4 AI Referral Traffic for the Overview KPI strip. Same pattern as
  // PR Influence: fetch sessions by sessionSource for the current and prior
  // period, then sum the AI-sourced rows via isAiSource(). Skipped entirely
  // when GA4 is not configured for the client.
  const ga4Configured = !!config?.ga4PropertyId
  const mainRange = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(mainRange)
  const compareDates = deriveCompareRange(mainRange, fetchMode)
  const mainIso = `${mainDates.startDate},${mainDates.endDate}`
  const compareIso = compareDates ? `${compareDates.startDate},${compareDates.endDate}` : null

  // The two-argument call (no compareMode) for previous_period is deliberate: it keeps v1 cache keys (JSON.stringify(args)) unchanged.
  const [peecRes, profoundRes, aiNowRes, aiPriorRes] = await Promise.allSettled([
    peecConfigured ? (fetchMode === 'previous_year' ? getPeecOverview(clientSlug, dateRange, fetchMode) : getPeecOverview(clientSlug, dateRange)) : Promise.resolve(null),
    profoundConfigured ? (fetchMode === 'previous_year' ? getProfoundOverview(clientSlug, dateRange, fetchMode) : getProfoundOverview(clientSlug, dateRange)) : Promise.resolve(null),
    ga4Configured && clientSlug
      ? ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions'], dimensions: ['sessionSource'], limit: 150 })
      : Promise.resolve(null),
    ga4Configured && clientSlug && compareIso
      ? ga4Query({ clientSlug, dateRange: compareIso, metrics: ['sessions'], dimensions: ['sessionSource'], limit: 150 })
      : Promise.resolve(null),
  ])

  const peecData     = peecRes.status     === 'fulfilled' ? peecRes.value     : null
  const profoundData = profoundRes.status === 'fulfilled' ? profoundRes.value : null

  const matchesAiFilter = (source: unknown): boolean => {
    if (!models) return isAiSource(source)
    const m = aiSourceModel(source)
    return m != null && models.includes(m)
  }
  const sumAiSessions = (rows: GA4Row[] | undefined | null) =>
    (rows ?? [])
      .filter((r) => matchesAiFilter(r.sessionSource))
      .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const aiNowOk    = aiNowRes.status === 'fulfilled'
  const aiPriorOk  = aiPriorRes.status === 'fulfilled'
  const aiNowRows  = aiNowRes.status   === 'fulfilled' ? (aiNowRes.value?.rows   ?? []) : []
  const aiPriorRows = aiPriorRes.status === 'fulfilled' ? (aiPriorRes.value?.rows ?? []) : []
  const aiTraffic: AIReferralKPI = {
    available: aiNowOk,
    sessions:        sumAiSessions(aiNowRows),
    sessionsPrior:   aiPriorOk ? sumAiSessions(aiPriorRows) : null,
  }

  // Snapshot KPIs (v2 only): the GA4 AI windows are fetched only when the layout has the v2 KPI strip, GA4 is
  // configured, and the selection could show a GA4 KPI. v1 layouts make no extra request.
  const saved = readSavedKpis(override?.kpis, clientSlug ?? '')
  const hasKpiStrip = resolvedLayout.some((r) => r.id === 'kpi-cards' && r.version === 2)
  const wantsGa4Kpi = saved === null || saved.some((id) => KPI_CATALOG[id].source === 'ga4')
  let ga4Kpi: Ga4KpiState = { status: 'not-configured' }
  if (hasKpiStrip && ga4Configured && clientSlug && wantsGa4Kpi) {
    const [nowRes, priorRes] = await Promise.allSettled([
      fetchAiKpiWindow(clientSlug, mainIso, config?.ga4Config),
      compareIso ? fetchAiKpiWindow(clientSlug, compareIso, config?.ga4Config) : Promise.resolve(null),
    ])
    if (nowRes.status === 'fulfilled') {
      ga4Kpi = { status: 'ok', now: nowRes.value, prior: priorRes.status === 'fulfilled' ? priorRes.value : null }
    } else {
      ga4Kpi = { status: 'error' }
      const name = nowRes.reason instanceof Error ? nowRes.reason.name : 'unknown'
      console.error(`[aeo-kpis] ga4 failed slug=${clientSlug} window=${mainIso} error=${name}`)
    }
    if (priorRes.status === 'rejected') {
      const name = priorRes.reason instanceof Error ? priorRes.reason.name : 'unknown'
      console.error(`[aeo-kpis] ga4 failed slug=${clientSlug} window=${compareIso} error=${name}`)
    }
  }
  // Profound sentiment (v2 only): fetched only when the strip is in the layout, Profound is configured, and the
  // selection shows sentiment (the defaults do not, so it must be saved). A failed side is null on its own.
  let profoundSentiment: KpiInputs['profoundSentiment'] = null
  const wantsSentiment = effectiveKpis(saved, { ga4Connected: ga4Configured, provider: 'profound' }).includes('sentiment')
  if (hasKpiStrip && profoundConfigured && clientSlug && wantsSentiment) {
    const [nowRes, priorRes] = await Promise.allSettled([
      getProfoundSentimentKpi(clientSlug, mainIso),
      compareIso ? getProfoundSentimentKpi(clientSlug, compareIso) : Promise.resolve(null),
    ])
    const settle = (r: PromiseSettledResult<number | null>, window: string | null): number | null => {
      if (r.status === 'fulfilled') return r.value
      const name = r.reason instanceof Error ? r.reason.name : 'unknown'
      console.error(`[aeo-kpis] profound sentiment failed slug=${clientSlug} window=${window} error=${name}`)
      return null
    }
    profoundSentiment = { now: settle(nowRes, mainIso), prior: settle(priorRes, compareIso) }
  }
  const kpi: KpiInputs = { saved, ga4Connected: ga4Configured, ga4: ga4Kpi, profoundSentiment }

  const availableProviders: AeoProvider[] = []
  if (peecData)     availableProviders.push('peec')
  if (profoundData) availableProviders.push('profound')

  if (availableProviders.length === 0) {
    return <p className="text-sm text-text-muted">No AEO provider is configured for this client.</p>
  }

  const sections: Partial<Record<AeoProvider, React.ReactNode>> = {}
  if (peecData)     sections.peec     = <ProviderSection data={peecData}     provider="peec"     models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} template={template} override={override} audience={audience} compare={compare} showDeltas={showDeltas} kpi={kpi} />
  if (profoundData) sections.profound = <ProviderSection data={profoundData} provider="profound" models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} template={template} override={override} audience={audience} compare={compare} showDeltas={showDeltas} kpi={kpi} />

  return (
    <>
      {clientSlug && <SharedPartsHeader viewKey="peec-ai" clientSlug={clientSlug} />}
      <ProviderTabs availableProviders={availableProviders} clientSlug={clientSlug ?? 'default'} sections={sections} />
    </>
  )
}

export type AIReferralKPI = {
  available: boolean
  sessions: number
  sessionsPrior: number | null
}
