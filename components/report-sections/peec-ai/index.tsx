import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview } from '@/lib/peec/client'
import { getProfoundOverview } from '@/lib/profound/client'
import type { ProfoundOverview } from '@/lib/profound/client'
import { ProviderTabs, type AeoProvider } from './provider-tabs'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { GA4Row } from '@/lib/ga4/types'
import { isAiSource, aiSourceModel } from '@/lib/constants'
import type { AEOModel } from '@/lib/peec/models'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { Sparkles } from 'lucide-react'
import { SectionHeader } from './section-header'
import { buildPeecCtx } from './ctx'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'
import type { SectionOverride } from '@/lib/report-sections/types'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'

// --- Per-provider section (shared markup; renders via parts registry) ---

type Overview = PeecOverview | ProfoundOverview

const registry = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)

function ProviderSection({
  data,
  provider,
  models = null,
  aiTraffic,
  clientSlug,
  dateRange,
  template,
  override,
}: {
  data: Overview
  provider: AeoProvider
  models?: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
  template: typeof PEEC_TEMPLATE
  override: SectionOverride | undefined
}) {
  const ctx = buildPeecCtx({ data, provider, models: models ?? null, aiTraffic, clientSlug, dateRange })
  const resolved = resolveSection(template, override)

  return (
    <div className="space-y-8">
      <SectionHeader
        icon={Sparkles}
        title="How visible is the brand across AI answer engines?"
      />
      {resolved.map((r) => {
        const impl = lookup(registry, r.id, r.version)
        return impl ? <div key={`${r.id}@${r.version}`}>{impl.render(ctx, r)}</div> : null
      })}
    </div>
  )
}

// --- Main report ---

export async function PeecAIReport({
  clientSlug,
  dateRange,
  models = null,
}: { clientSlug?: string; dateRange?: string; models?: AEOModel[] | null } = {}) {
  const config = clientSlug ? await getClientBySlug(clientSlug) : null
  const peecConfigured = !!config?.peecCustomerProjectId
  const profoundConfigured = !!config?.profoundCategoryId

  // GA4 AI Referral Traffic for the Overview KPI strip. Same pattern as
  // PR Influence: fetch sessions by sessionSource for the current and prior
  // period, then sum the AI-sourced rows via isAiSource(). Skipped entirely
  // when GA4 is not configured for the client.
  const ga4Configured = !!config?.ga4PropertyId
  const mainRange = dateRange ?? 'last_30_days'
  const mainDates = parseDateRange(mainRange)
  const compareDates = deriveCompareRange(mainRange, 'previous_period')
  const mainIso = `${mainDates.startDate},${mainDates.endDate}`
  const compareIso = compareDates ? `${compareDates.startDate},${compareDates.endDate}` : null

  const [peecRes, profoundRes, aiNowRes, aiPriorRes] = await Promise.allSettled([
    peecConfigured ? getPeecOverview(clientSlug, dateRange) : Promise.resolve(null),
    profoundConfigured ? getProfoundOverview(clientSlug, dateRange) : Promise.resolve(null),
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

  const availableProviders: AeoProvider[] = []
  if (peecData)     availableProviders.push('peec')
  if (profoundData) availableProviders.push('profound')

  if (availableProviders.length === 0) {
    return <p className="text-sm text-text-muted">No AEO provider is configured for this client.</p>
  }

  const [dbTemplate] = await Promise.all([getSectionTemplate('peec-ai')])
  const template = dbTemplate ?? PEEC_TEMPLATE
  const override = config?.reportSectionConfig?.['peec-ai']

  const sections: Partial<Record<AeoProvider, React.ReactNode>> = {}
  if (peecData)     sections.peec     = <ProviderSection data={peecData}     provider="peec"     models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} template={template} override={override} />
  if (profoundData) sections.profound = <ProviderSection data={profoundData} provider="profound" models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} template={template} override={override} />

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
