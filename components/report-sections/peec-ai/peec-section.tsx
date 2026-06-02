/**
 * Peec AEO section — visibility chart, KPI cards, LLM breakdown,
 * brand rankings, top domains, and tracked prompts.
 *
 * Independently Suspense'd from the Profound section, so Peec data
 * appears as soon as `getPeecOverview` resolves — even if Profound
 * is slower or errors.
 */
import { getPeecOverview } from '@/lib/peec/client'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { VisibilityChart } from './visibility-chart'
import { TrackedPromptsChart } from './tracked-prompts-chart'
import { LLMBreakdownTable } from './llm-breakdown-table'
import {
  KpiCard,
  BrandSOVChart,
  BrandDefinitions,
  DomainTypesChart,
  DomainTypeDefinitions,
} from './_shared'

interface Props {
  clientSlug?: string
}

export async function PeecSection({ clientSlug }: Props) {
  const peecData = await getPeecOverview(clientSlug).catch(() => null)
  if (!peecData) return null

  const peecYou = peecData.brandRankings.find((b) => b.isYou)

  return (
    <>
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Answer Engine Optimization
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Overview
        </h2>
      </div>

      {peecData.weeklyVisibility.length > 0 && (
        <VisibilityChart
          data={peecData.weeklyVisibility}
          competitorData={peecData.competitorWeeklyVisibility}
          brandName={peecYou?.name ?? process.env.PEEC_AI_YOUR_BRAND}
        />
      )}

      {peecYou && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              title: 'Visibility',
              value: `${peecYou.visibility.toFixed(1)}%`,
              delta: peecYou.visibilityDelta,
              subtitle: `Competitor avg · ${peecData.competitorAverages.visibility.toFixed(1)}%`,
              tooltip: `% of AI responses mentioning your brand, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
            },
            {
              title: 'Share of Voice',
              value: `${peecYou.sov.toFixed(1)}%`,
              delta: peecYou.sovDelta,
              subtitle: `Competitor avg · ${peecData.competitorAverages.sov.toFixed(1)}%`,
              tooltip: `Your share of all AI brand mentions, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
            },
            {
              title: 'Position',
              value: `#${peecYou.position.toFixed(1)}`,
              delta: peecYou.positionDelta,
              subtitle: `Competitor avg · #${peecData.competitorAverages.position.toFixed(1)}`,
              tooltip: `Avg rank when your brand appears in AI responses (lower is better), Jan 1 – today vs. same period last year.`,
              invertDelta: true,
            },
          ].map(({ title, value, delta, tooltip, subtitle, invertDelta }) => (
            <KpiCard
              key={title}
              title={title}
              value={value}
              delta={delta}
              tooltip={tooltip}
              subtitle={subtitle}
              invertDelta={invertDelta}
            />
          ))}
        </div>
      )}

      {peecData.llmBreakdown.length > 0 && (
        <LLMBreakdownTable breakdown={peecData.llmBreakdown} />
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px] items-stretch">
        <BrandRankingsTable rankingsByRange={peecData.brandRankingsByRange} />
        <div className="flex flex-col gap-5 h-full">
          <BrandSOVChart brands={peecData.brandRankings} />
          <BrandDefinitions />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <TopDomainsTable
          domainsByRange={peecData.domainsByRange}
          totalCitationsByRange={peecData.totalCitationsByRange}
        />
        <div className="flex flex-col gap-5">
          <DomainTypesChart types={peecData.domainTypes} />
          <DomainTypeDefinitions source="peec" />
        </div>
      </div>

      {peecData.trackedPrompts.length > 0 && (
        <TrackedPromptsChart
          prompts={peecData.trackedPrompts}
          brandName={peecYou?.name ?? process.env.PEEC_AI_YOUR_BRAND}
        />
      )}

      <p className="text-xs text-text-muted">Live data from Peec AI</p>
    </>
  )
}
