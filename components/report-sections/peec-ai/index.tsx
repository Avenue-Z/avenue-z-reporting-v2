import { Suspense } from 'react'
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview, TrackedPrompt } from '@/lib/peec/client'
import { applyModelFilter, computeWinnersLosers } from '@/lib/peec/winners-losers'
import { getProfoundOverview } from '@/lib/profound/client'
import type { ProfoundOverview } from '@/lib/profound/client'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { VisibilityChart } from './visibility-chart'
import { LLMBreakdownTable } from './llm-breakdown-table'
import { WinnersLosersCards } from './winners-losers-cards'
import { ProviderTabs, type AeoProvider } from './provider-tabs'
import { OverviewSynopsis } from './overview-synopsis'
import { SynopsisSkeleton } from './synopsis-skeleton'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { GA4Row } from '@/lib/ga4/types'
import { isAiSource, aiSourceModel, SHOW_AI_NARRATIVE } from '@/lib/constants'
import { sumModelMap } from '@/lib/peec/by-model'
import type { AEOModel } from '@/lib/peec/models'
import { BrandRankingsTable as ProfoundBrandRankingsTable } from '../profound-ai/brand-rankings-table'
import { TopDomainsTable as ProfoundTopDomainsTable } from '../profound-ai/top-domains-table'
import { LLMBreakdownTable as ProfoundLLMBreakdownTable } from '../profound-ai/llm-breakdown-table'
import { PEEC, AVENUE_Z, PROFOUND } from '@/lib/peec/metric-definitions'
import { getClientBySlug } from '@/lib/db/queries'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Sparkles } from 'lucide-react'
import { SectionHeader } from './section-header'

// --- Helpers ---

function KpiCard({
  title, value, delta, tooltip, subtitle, invertDelta = false,
}: {
  title: string
  value: string | number
  delta?: number
  tooltip?: string
  subtitle?: string
  invertDelta?: boolean
}) {
  const positive = invertDelta ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{title}</p>
        {tooltip && (
          <InfoTooltip text={tooltip} />
        )}
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">{value}</p>
      {delta !== undefined && (
        <p className={cn('mt-1 text-sm font-bold', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
          {(invertDelta ? delta <= 0 : delta >= 0) ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs previous period
        </p>
      )}
      {subtitle && (
        <p className="mt-1.5 text-xs text-text-muted">{subtitle}</p>
      )}
    </div>
  )
}

// --- Shared sub-components (work for both Peec and Profound brand/domain data) ---

// FB-008: domain-type color mapping. Uses the five Avenue Z brand accents at
// full saturation for the primary categories. Reference and Institutional reuse
// their semantic parent (Editorial → blue, Competitor → purple) at 60% opacity
// to signal "secondary version of this kind of source." Other uses 20% white
// (subtle neutral, not brand-gray) to avoid the all-gray look Tina flagged.
// Brand doc reference: BRANDOFFICIAL.md (yellow / green / cyan / blue / purple).
// Single source of truth — referenced by both DomainTypesChart and
// DomainTypeDefinitions so the chart bar and the legend dot always match.
const DOMAIN_TYPE_COLORS: Record<string, string> = {
  Own:           '#60FDFF',    // brand cyan
  Corporate:     '#FFFC60',    // brand yellow
  Competitor:    '#6034FF',    // brand purple
  UGC:           '#60FF80',    // brand green
  Editorial:     '#39A0FF',    // brand blue
  Reference:     '#39A0FF99',  // brand blue at 60% (kin of Editorial)
  Institutional: '#6034FF99',  // brand purple at 60% (kin of Competitor)
  Other:         '#FFFFFF33',  // white at 20% (subtle neutral)
}

function DomainTypesChart({ types, source }: { types: { type: string; percentage: number }[]; source: 'peec' | 'profound' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="flex items-center gap-1.5 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">What kinds of sources do AI models cite?</p>
        <InfoTooltip text={`Distribution of domain types across all sources cited by AI models. ${AVENUE_Z.domainTypes.text}`} />
      </div>
      <div className="space-y-2.5">
        {types.map((t) => (
          <div key={t.type} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-xs text-text-muted">{t.type}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
              <div
                className="h-full rounded-sm"
                style={{ width: `${t.percentage}%`, backgroundColor: DOMAIN_TYPE_COLORS[t.type] ?? '#FFFFFF33' }}
              />
            </div>
            <div className="w-8 shrink-0 text-right text-xs tabular-nums text-white">{t.percentage}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DomainTypeDefinitions({ source }: { source: 'peec' | 'profound' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">What do these domain types mean?</p>
        <InfoTooltip text={`Domain types are classified by ${source === 'profound' ? 'Profound' : 'Peec AI'} based on each domain's content and category.`} />
      </div>
      {[
        { type: 'Own',           desc: 'Your own owned domains.' },
        { type: 'Corporate',     desc: 'Brand and company websites.' },
        { type: 'Competitor',    desc: 'Competing brand domains.' },
        { type: 'UGC',           desc: 'User-generated content. Reddit, Quora, forums, etc.' },
        { type: 'Editorial',     desc: 'News outlets and editorial publications.' },
        { type: 'Reference',     desc: 'Wikipedia, databases, and directories.' },
        { type: 'Institutional', desc: 'Academic, government, and non-profit sources.' },
        { type: 'Other',         desc: 'Unclassified or miscellaneous domains.' },
      ].map(({ type, desc }) => (
        <div key={type} className="flex gap-2">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DOMAIN_TYPE_COLORS[type] ?? '#FFFFFF33' }} />
          <p className="text-[11px] leading-snug">
            <span className="font-semibold text-white">{type} </span>
            <span className="text-text-muted">{desc}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

// --- Per-provider section (shared markup; provider-specific tables + definitions) ---

type Overview = PeecOverview | ProfoundOverview

function ProviderSection({
  data,
  provider,
  models = null,
  aiTraffic,
  clientSlug,
  dateRange,
}: {
  data: Overview
  provider: AeoProvider
  models?: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
}) {
  const isPeec = provider === 'peec'
  const you = data.brandRankings.find((b) => b.isYou)

  // Model filter: when active, recompute the headline KPIs and the LLM table from
  // the per-model breakdown restricted to the selected models. Deltas are hidden
  // while filtered (no per-model prior-period data is fetched) — same fidelity as
  // the PR Influence / Content Impact pages.
  const modelActive = models != null
  const llmFiltered = modelActive
    ? data.llmBreakdown.filter((r) => models!.includes(r.model as AEOModel))
    : data.llmBreakdown
  const avgFiltered = (sel: (r: (typeof llmFiltered)[number]) => number): number | null =>
    llmFiltered.length > 0 ? llmFiltered.reduce((s, r) => s + sel(r), 0) / llmFiltered.length : null
  const visFiltered = avgFiltered((r) => r.visibility)
  const brandName = you?.name ?? (isPeec ? process.env.PEEC_AI_YOUR_BRAND : process.env.PROFOUND_AI_YOUR_BRAND)
  const Rankings = isPeec ? BrandRankingsTable : ProfoundBrandRankingsTable
  const Domains  = isPeec ? TopDomainsTable : ProfoundTopDomainsTable
  const LLM      = isPeec ? LLMBreakdownTable : ProfoundLLMBreakdownTable
  const DEF      = isPeec ? PEEC : PROFOUND
  const label    = isPeec ? 'Peec AI' : 'Profound'

  // Citation Share %: share of total tracked-domain citations attributed to
  // the client's own domain. Truth-grounded across both providers — for Peec,
  // sum of citation_count where domain matches client.domain; for Profound,
  // same math against Profound's per-hostname rows. See lib/peec/client.ts
  // and lib/profound/client.ts.
  const citationShareNow   = data.totalCitations      > 0 ? (data.yourBrandCitations      / data.totalCitations)      * 100 : null
  const citationSharePrior = data.totalCitationsPrior > 0 ? (data.yourBrandCitationsPrior / data.totalCitationsPrior) * 100 : null
  const citationShareDelta = citationShareNow != null && citationSharePrior != null ? citationShareNow - citationSharePrior : undefined

  // Model-filtered Citation Share: recompute from per-model citation totals when
  // a model is selected. Profound's maps are empty → denom 0 → null → '--'.
  // Delta hidden while filtered (no per-model prior-period data).
  const citShareNumer = sumModelMap(data.yourBrandCitationsByModel, models)
  const citShareDenom = sumModelMap(data.totalCitationsByModel, models)
  const citationShareValue = modelActive
    ? (citShareDenom > 0 ? (citShareNumer / citShareDenom) * 100 : null)
    : citationShareNow
  const citationShareDeltaShown = modelActive ? undefined : citationShareDelta

  // AI Referral Traffic % delta: undefined when the prior period had zero
  // sessions (no meaningful baseline). Value shown as raw session count.
  const aiTrafficDelta =
    aiTraffic.available && aiTraffic.sessionsPrior != null && aiTraffic.sessionsPrior > 0
      ? ((aiTraffic.sessions - aiTraffic.sessionsPrior) / aiTraffic.sessionsPrior) * 100
      : undefined

  // FB-023: Biggest Winners / Biggest Losers — live per-period compute, reactive
  // to BOTH date range (because trackedPrompts is fetched per-range) AND model
  // filter (because applyModelFilter restricts the per-model maps to the active
  // selection). Sandbox gate is lifted — every client sees their own real cards.
  // Profound provider variant: trackedPrompts have empty positionByModel +
  // priorPositionByModel maps (parity defer), so applyModelFilter drops them all
  // and the cards render the empty state.
  const flat = applyModelFilter(data.trackedPrompts as TrackedPrompt[], models)
  const { winners, losers } = computeWinnersLosers(flat)

  return (
    <div className="space-y-8">
      <SectionHeader
        icon={Sparkles}
        title="How visible is the brand across AI answer engines?"
      />

      {SHOW_AI_NARRATIVE && (
        <Suspense fallback={<SynopsisSkeleton />}>
          <OverviewSynopsis
            clientSlug={clientSlug}
            dateRange={dateRange}
            provider={provider}
            data={data}
            aiSessions={aiTraffic.available ? aiTraffic.sessions : null}
          />
        </Suspense>
      )}

      {you && (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Snapshot KPIs</h3>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              {
                title: 'Visibility',
                value: modelActive ? (visFiltered != null ? `${visFiltered.toFixed(1)}%` : '--') : `${you.visibility.toFixed(1)}%`,
                delta: modelActive ? undefined : you.visibilityDelta,
                subtitle: `Competitor avg · ${data.competitorAverages.visibility.toFixed(1)}%`,
                tooltip: `${DEF.visibility.text} (${label}.) Shown for the selected date range vs. the previous period. Competitor avg is the mean across all tracked brands for that range.`,
              },
              {
                title: 'Citation Share',
                value: citationShareValue != null ? `${citationShareValue.toFixed(1)}%` : '--',
                delta: citationShareDeltaShown,
                subtitle: modelActive
                  ? (citShareDenom > 0
                      ? `${citShareNumer.toLocaleString()} of ${citShareDenom.toLocaleString()} citations`
                      : 'No per-model data')
                  : `${data.yourBrandCitations.toLocaleString()} of ${data.totalCitations.toLocaleString()} citations`,
                tooltip: `Share of total tracked-domain citations attributed to your brand's own domain in the selected date range vs. the previous period. Sourced from ${label}.`,
              },
              {
                title: 'AI Referral Traffic',
                value: aiTraffic.available ? aiTraffic.sessions.toLocaleString() : '--',
                delta: modelActive ? undefined : aiTrafficDelta,
                subtitle: aiTraffic.available
                  ? (modelActive ? 'GA4 sessions from selected AI sources' : 'GA4 sessions from AI sources')
                  : 'GA4 not configured',
                tooltip: 'Sessions from AI referrers (ChatGPT, Perplexity, Gemini, etc.) tracked in GA4. Selected date range vs. the previous period.',
              },
            ].map(({ title, value, delta, tooltip, subtitle }) => (
              <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} />
            ))}
          </div>
        </div>
      )}

      {data.dailyVisibility.length > 0 && (
        <VisibilityChart
          data={data.dailyVisibility}
          competitorData={data.competitorDailyVisibility}
          brandName={brandName}
        />
      )}

      {llmFiltered.length > 0 && <LLM breakdown={llmFiltered} />}

      <WinnersLosersCards
        clientSlug={clientSlug}
        winners={winners}
        losers={losers}
      />

      <Rankings rankings={data.brandRankings} />

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Domains domains={data.topDomains} totalCitations={data.totalCitations} />
        <div className="flex flex-col gap-5">
          <DomainTypesChart types={data.domainTypes} source={provider} />
          <DomainTypeDefinitions source={provider} />
        </div>
      </div>

      <p className="text-xs text-text-muted">{`Live data from ${label}`}</p>
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

  const sections: Partial<Record<AeoProvider, React.ReactNode>> = {}
  if (peecData)     sections.peec     = <ProviderSection data={peecData}     provider="peec"     models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} />
  if (profoundData) sections.profound = <ProviderSection data={profoundData} provider="profound" models={models} aiTraffic={aiTraffic} clientSlug={clientSlug} dateRange={dateRange} />

  return (
    <ProviderTabs availableProviders={availableProviders} clientSlug={clientSlug ?? 'default'} sections={sections} />
  )
}

export type AIReferralKPI = {
  available: boolean
  sessions: number
  sessionsPrior: number | null
}
