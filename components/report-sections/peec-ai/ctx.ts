import type { AEOModel } from '@/lib/peec/models'
import { applyModelFilter, computeWinnersLosers } from '@/lib/peec/winners-losers'
import { sumModelMap } from '@/lib/peec/by-model'
import { PEEC, PROFOUND } from '@/lib/peec/metric-definitions'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { LLMBreakdownTable } from './llm-breakdown-table'
import { BrandRankingsTable as ProfoundBrandRankingsTable } from '../profound-ai/brand-rankings-table'
import { TopDomainsTable as ProfoundTopDomainsTable } from '../profound-ai/top-domains-table'
import { LLMBreakdownTable as ProfoundLLMBreakdownTable } from '../profound-ai/llm-breakdown-table'
import type { AeoProvider } from './provider-tabs'
import type { PeecOverview, TrackedPrompt } from '@/lib/peec/client'
import type { ProfoundOverview } from '@/lib/profound/client'
import type { AIReferralKPI } from './index'
import type { AeoCompare } from './v2/compare'
import type { KpiId } from '@/lib/report-sections/aeo-kpis'
import type { Ga4KpiState } from '@/lib/ga4/ai-kpis'

type Overview = PeecOverview | ProfoundOverview

/** AEO Overview v2 Snapshot KPIs: what the tiles need beyond the Peec/Profound overview. v1 parts ignore it. */
export type KpiInputs = {
  saved: KpiId[] | null
  ga4Connected: boolean
  ga4: Ga4KpiState
  profoundSentiment: { now: number | null; prior: number | null } | null
}

export const DEFAULT_KPI_INPUTS: KpiInputs = {
  saved: null,
  ga4Connected: false,
  ga4: { status: 'not-configured' },
  profoundSentiment: null,
}

/** Who the report is rendered for: the Avenue Z dashboard ('internal') or the client portal and PDF export ('client'). */
export type ReportAudience = 'internal' | 'client'

export type PeecCtx = {
  data: Overview
  provider: AeoProvider
  aiTraffic: AIReferralKPI
  clientSlug: string | undefined
  dateRange: string | undefined
  isPeec: boolean
  /** The model filter (null = all models). The Overview competitor parts filter and hide deltas by it. */
  models: AEOModel[] | null
  /** Who this render is for; the competitor gap table shows prompt text only to 'internal' (D-15). */
  audience: ReportAudience
  /** AEO Overview v2: which window the deltas compare against. v1 parts ignore it. */
  compare: AeoCompare
  /** AEO Overview v2: the Show deltas switch. v1 parts ignore it. */
  showDeltas: boolean
  /** AEO Overview v2: Snapshot KPI inputs. v1 parts ignore it. */
  kpi: KpiInputs
  you: Overview['brandRankings'][number] | undefined
  modelActive: boolean
  llmFiltered: Overview['llmBreakdown']
  visFiltered: number | null
  brandName: string | undefined
  Rankings: typeof BrandRankingsTable | typeof ProfoundBrandRankingsTable
  Domains: typeof TopDomainsTable | typeof ProfoundTopDomainsTable
  LLM: typeof LLMBreakdownTable | typeof ProfoundLLMBreakdownTable
  DEF: typeof PEEC | typeof PROFOUND
  label: string
  citationShareValue: number | null
  citationShareDeltaShown: number | undefined
  citShareNumer: number
  citShareDenom: number
  aiTrafficDelta: number | undefined
  winners: ReturnType<typeof computeWinnersLosers>['winners']
  losers: ReturnType<typeof computeWinnersLosers>['losers']
}

export function buildPeecCtx(args: {
  data: Overview
  provider: AeoProvider
  models: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
  audience: ReportAudience
  compare?: AeoCompare
  showDeltas?: boolean
  kpi?: KpiInputs
}): PeecCtx {
  const { data, provider, models, aiTraffic } = args

  const isPeec = provider === 'peec'
  const you = data.brandRankings.find((b) => b.isYou)

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

  const citationShareNow   = data.totalCitations      > 0 ? (data.yourBrandCitations      / data.totalCitations)      * 100 : null
  const citationSharePrior = data.totalCitationsPrior > 0 ? (data.yourBrandCitationsPrior / data.totalCitationsPrior) * 100 : null
  const citationShareDelta = citationShareNow != null && citationSharePrior != null ? citationShareNow - citationSharePrior : undefined

  const citShareNumer = sumModelMap(data.yourBrandCitationsByModel, models)
  const citShareDenom = sumModelMap(data.totalCitationsByModel, models)
  const citationShareValue = modelActive
    ? (citShareDenom > 0 ? (citShareNumer / citShareDenom) * 100 : null)
    : citationShareNow
  const citationShareDeltaShown = modelActive ? undefined : citationShareDelta

  const aiTrafficDelta =
    aiTraffic.available && aiTraffic.sessionsPrior != null && aiTraffic.sessionsPrior > 0
      ? ((aiTraffic.sessions - aiTraffic.sessionsPrior) / aiTraffic.sessionsPrior) * 100
      : undefined

  const flat = applyModelFilter(data.trackedPrompts as TrackedPrompt[], models)
  const { winners, losers } = computeWinnersLosers(flat)

  return {
    data,
    provider,
    aiTraffic,
    clientSlug: args.clientSlug,
    dateRange: args.dateRange,
    isPeec,
    models,
    audience: args.audience,
    compare: args.compare ?? 'previous_period',
    showDeltas: args.showDeltas ?? true,
    kpi: args.kpi ?? DEFAULT_KPI_INPUTS,
    you,
    modelActive,
    llmFiltered,
    visFiltered,
    brandName,
    Rankings,
    Domains,
    LLM,
    DEF,
    label,
    citationShareValue,
    citationShareDeltaShown,
    citShareNumer,
    citShareDenom,
    aiTrafficDelta,
    winners,
    losers,
  }
}
