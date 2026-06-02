/**
 * Profound section — visibility chart, KPI cards, LLM breakdown, brand
 * rankings, top domains, and tracked prompts, fed from Profound's API.
 *
 * Independently Suspense'd from the Peec section. Clients without a
 * configured profoundCategoryId get an empty shape from the cached
 * impl, which is rendered as section-header-plus-no-data (no error).
 */
import { getProfoundOverview } from '@/lib/profound/client'
import { BrandRankingsTable as ProfoundBrandRankingsTable } from '../profound-ai/brand-rankings-table'
import { TopDomainsTable as ProfoundTopDomainsTable }     from '../profound-ai/top-domains-table'
import { VisibilityChart as ProfoundVisibilityChart }     from '../profound-ai/visibility-chart'
import { TrackedPromptsChart as ProfoundTrackedPromptsChart } from '../profound-ai/tracked-prompts-chart'
import { LLMBreakdownTable as ProfoundLLMBreakdownTable } from '../profound-ai/llm-breakdown-table'
import {
  KpiCard,
  BrandSOVChart,
  BrandDefinitions,
  DomainTypesChart,
  DomainTypeDefinitions,
  SectionDivider,
} from './_shared'

interface Props {
  clientSlug?: string
}

export async function ProfoundSection({ clientSlug }: Props) {
  const profoundData = await getProfoundOverview(clientSlug).catch(() => null)

  return (
    <>
      <SectionDivider title="Profound" />

      {profoundData && (
        <>
          {profoundData.weeklyVisibility.length > 0 && (
            <ProfoundVisibilityChart
              data={profoundData.weeklyVisibility}
              competitorData={profoundData.competitorWeeklyVisibility}
              brandName={profoundData.brandRankings.find((b) => b.isYou)?.name ?? process.env.PROFOUND_AI_YOUR_BRAND}
            />
          )}

          {(() => {
            const profoundYou = profoundData.brandRankings.find((b) => b.isYou)
            if (!profoundYou) return null
            return (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                {[
                  {
                    title: 'Visibility',
                    value: `${profoundYou.visibility.toFixed(1)}%`,
                    delta: profoundYou.visibilityDelta,
                    subtitle: `Competitor avg · ${profoundData.competitorAverages.visibility.toFixed(1)}%`,
                    tooltip: `% of AI responses mentioning your brand, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                  },
                  {
                    title: 'Share of Voice',
                    value: `${profoundYou.sov.toFixed(1)}%`,
                    delta: profoundYou.sovDelta,
                    subtitle: `Competitor avg · ${profoundData.competitorAverages.sov.toFixed(1)}%`,
                    tooltip: `Your share of all AI brand mentions, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                  },
                  {
                    title: 'Position',
                    value: `#${profoundYou.position.toFixed(1)}`,
                    delta: profoundYou.positionDelta,
                    subtitle: `Competitor avg · #${profoundData.competitorAverages.position.toFixed(1)}`,
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
            )
          })()}

          {profoundData.llmBreakdown.length > 0 && (
            <ProfoundLLMBreakdownTable breakdown={profoundData.llmBreakdown} />
          )}

          <div className="grid gap-5 lg:grid-cols-[1fr_280px] items-stretch">
            <ProfoundBrandRankingsTable rankingsByRange={profoundData.brandRankingsByRange} />
            <div className="flex flex-col gap-5 h-full">
              <BrandSOVChart brands={profoundData.brandRankings} />
              <BrandDefinitions />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <ProfoundTopDomainsTable
              domainsByRange={profoundData.domainsByRange}
              totalCitationsByRange={profoundData.totalCitationsByRange}
            />
            <div className="flex flex-col gap-5">
              <DomainTypesChart types={profoundData.domainTypes} />
              <DomainTypeDefinitions source="profound" />
            </div>
          </div>

          {profoundData.trackedPrompts.length > 0 && (
            <ProfoundTrackedPromptsChart prompts={profoundData.trackedPrompts} />
          )}

          <p className="text-xs text-text-muted">Live data from Profound</p>
        </>
      )}
    </>
  )
}
