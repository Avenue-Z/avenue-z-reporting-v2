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

type Overview = PeecOverview | ProfoundOverview

export type PeecCtx = {
  isPeec: boolean
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
    isPeec,
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
