import { getPeecOverview } from '@/lib/peec/client'
import type { DomainType, BrandRanking } from '@/lib/peec/client'
import { getProfoundOverview } from '@/lib/profound/client'
import type { DomainType as ProfoundDomainType, BrandRanking as ProfoundBrandRanking } from '@/lib/profound/client'
import { BRAND_TYPE_MAP, BRAND_TYPE_COLORS, BRAND_TYPE_DEFINITIONS } from '@/lib/peec/brand-types'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { VisibilityChart } from './visibility-chart'
import { TrackedPromptsChart } from './tracked-prompts-chart'
import { LLMBreakdownTable } from './llm-breakdown-table'
import { BrandRankingsTable as ProfoundBrandRankingsTable } from '../profound-ai/brand-rankings-table'
import { TopDomainsTable as ProfoundTopDomainsTable } from '../profound-ai/top-domains-table'
import { VisibilityChart as ProfoundVisibilityChart } from '../profound-ai/visibility-chart'
import { TrackedPromptsChart as ProfoundTrackedPromptsChart } from '../profound-ai/tracked-prompts-chart'
import { LLMBreakdownTable as ProfoundLLMBreakdownTable } from '../profound-ai/llm-breakdown-table'
import { sampleProfoundOverview } from '@/lib/demo-data/profound'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { PEEC, AVENUE_Z, PROFOUND } from '@/lib/peec/metric-definitions'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'

// --- Helpers ---

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

// --- Shared KPI card ---

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
          {(invertDelta ? delta <= 0 : delta >= 0) ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs prior year
        </p>
      )}
      {subtitle && (
        <p className="mt-1.5 text-xs text-text-muted">{subtitle}</p>
      )}
    </div>
  )
}

// --- Shared sub-components (work for both Peec and Profound brand/domain data) ---

function BrandSOVChart({ brands }: { brands: { name: string; sov: number }[] }) {
  const typeMap = new Map<string, { sovSum: number; count: number; names: string[] }>()
  for (const b of brands) {
    const type = BRAND_TYPE_MAP[b.name] ?? 'Other'
    const existing = typeMap.get(type)
    if (existing) {
      existing.sovSum += b.sov
      existing.count += 1
      existing.names.push(b.name)
    } else {
      typeMap.set(type, { sovSum: b.sov, count: 1, names: [b.name] })
    }
  }
  const rows = Array.from(typeMap.entries())
    .map(([type, { sovSum, count, names }]) => ({ type, avgSov: sovSum / count, names }))
    .sort((a, b) => b.avgSov - a.avgSov)
  const maxSov = Math.max(...rows.map((r) => r.avgSov), 1)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Which categories of brands earn AI share of voice?</p>
        <InfoTooltip text={AVENUE_Z.brandTypes.text} />
      </div>
      <p className="text-xs text-text-muted mb-4">Avg share of voice by category</p>
      <div className="space-y-2.5">
        {rows.map(({ type, avgSov }) => (
          <div key={type} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-xs text-text-muted">{type}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
              <div
                className="h-full rounded-sm"
                style={{ width: `${(avgSov / maxSov) * 100}%`, backgroundColor: BRAND_TYPE_COLORS[type] ?? '#8A8A8A' }}
              />
            </div>
            <div className="w-10 shrink-0 text-right text-xs tabular-nums text-white">{avgSov.toFixed(1)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BrandDefinitions() {
  return (
    <div className="flex-1 rounded-lg border border-white/[0.06] bg-bg-surface p-5 space-y-2.5">
      <div className="flex items-center gap-1.5 mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">What do these brand categories mean?</p>
        <InfoTooltip text={AVENUE_Z.brandTypes.text} />
      </div>
      {BRAND_TYPE_DEFINITIONS.map(({ type, desc }) => (
        <div key={type} className="flex gap-2">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: BRAND_TYPE_COLORS[type] ?? '#8A8A8A' }} />
          <p className="text-[11px] leading-snug">
            <span className="font-semibold text-white">{type} </span>
            <span className="text-text-muted">{desc}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

function DomainTypesChart({ types, source }: { types: { type: string; percentage: number }[]; source: 'peec' | 'profound' }) {
  const TYPE_COLORS: Record<string, string> = {
    Own:           '#60FDFF',
    Corporate:     '#8A8A8A',
    Competitor:    '#8A8A8A',
    UGC:           '#60FF80',
    Editorial:     '#39A0FF',
    Reference:     '#8A8A8A',
    Institutional: '#8A8A8A',
    Other:         '#8A8A8A',
  }
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
                style={{ width: `${t.percentage}%`, backgroundColor: TYPE_COLORS[t.type] ?? '#8A8A8A' }}
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
        { type: 'Own',           color: '#60FDFF', desc: 'Your own owned domains.' },
        { type: 'Corporate',     color: '#8A8A8A', desc: 'Brand and company websites.' },
        { type: 'Competitor',    color: '#8A8A8A', desc: 'Competing brand domains.' },
        { type: 'UGC',           color: '#60FF80', desc: 'User-generated content — Reddit, Quora, forums, etc.' },
        { type: 'Editorial',     color: '#39A0FF', desc: 'News outlets and editorial publications.' },
        { type: 'Reference',     color: '#8A8A8A', desc: 'Wikipedia, databases, and directories.' },
        { type: 'Institutional', color: '#8A8A8A', desc: 'Academic, government, and non-profit sources.' },
        { type: 'Other',         color: '#8A8A8A', desc: 'Unclassified or miscellaneous domains.' },
      ].map(({ type, color, desc }) => (
        <div key={type} className="flex gap-2">
          <span className="mt-[3px] h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <p className="text-[11px] leading-snug">
            <span className="font-semibold text-white">{type} </span>
            <span className="text-text-muted">{desc}</span>
          </p>
        </div>
      ))}
    </div>
  )
}

// --- Section divider ---

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-4 pt-4">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Answer Engine Optimization
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">{title}</h2>
      </div>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  )
}

// --- Main report ---

export async function PeecAIReport({ clientSlug, dateRange, demoMode = false }: { clientSlug?: string; dateRange?: string; demoMode?: boolean } = {}) {
  const [peec, profound] = await Promise.allSettled([
    getPeecOverview(clientSlug),
    getProfoundOverview(clientSlug),
  ])

  let peecData     = peec.status     === 'fulfilled' ? peec.value     : null
  let profoundData = profound.status === 'fulfilled' ? profound.value : null

  // Demo mode: force-substitute BOTH Peec and Profound with sample data
  // so the demo never mixes real client data with synthetic. The Sample
  // badge surfaces in each section so it's clear what's going on.
  const peecIsDemo     = demoMode
  const profoundIsDemo = demoMode
  if (peecIsDemo)     peecData     = samplePeecOverview()
  if (profoundIsDemo) profoundData = sampleProfoundOverview()

  const peecYou    = peecData?.brandRankings.find((b) => b.isYou)
  const profoundYou = profoundData?.brandRankings.find((b) => b.isYou)

  return (
    <div className="space-y-8">

      {/* ── PEEC AI SECTION ─────────────────────────────────────────────── */}

      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Answer Engine Optimization
        </p>
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-extrabold uppercase text-white">
            Overview
          </h2>
          {peecIsDemo && <SampleDataBadge />}
        </div>
      </div>

      {peecData && (
        <>
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
                  tooltip: `${PEEC.visibility.text} (Peec AI.) Shown YTD vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                },
                {
                  title: 'Share of Voice',
                  value: `${peecYou.sov.toFixed(1)}%`,
                  delta: peecYou.sovDelta,
                  subtitle: `Competitor avg · ${peecData.competitorAverages.sov.toFixed(1)}%`,
                  tooltip: `${PEEC.sov.text} (Peec AI.) Shown YTD vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                },
                {
                  title: 'Position',
                  value: `#${peecYou.position.toFixed(1)}`,
                  delta: peecYou.positionDelta,
                  subtitle: `Competitor avg · #${peecData.competitorAverages.position.toFixed(1)}`,
                  tooltip: `${PEEC.position.text} (Peec AI.) Shown YTD vs. same period last year.`,
                  invertDelta: true,
                },
              ].map(({ title, value, delta, tooltip, subtitle, invertDelta }) => (
                <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} invertDelta={invertDelta} />
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
            <TopDomainsTable domainsByRange={peecData.domainsByRange} totalCitationsByRange={peecData.totalCitationsByRange} />
            <div className="flex flex-col gap-5">
              <DomainTypesChart types={peecData.domainTypes} source="peec" />
              <DomainTypeDefinitions source="peec" />
            </div>
          </div>

          {peecData.trackedPrompts.length > 0 && (
            <TrackedPromptsChart prompts={peecData.trackedPrompts} brandName={peecYou?.name ?? process.env.PEEC_AI_YOUR_BRAND} />
          )}

          <p className="text-xs text-text-muted">{peecIsDemo ? 'Sample data — demo mode' : 'Live data from Peec AI'}</p>
        </>
      )}

      {/* ── PROFOUND SECTION ────────────────────────────────────────────── */}

      <SectionDivider title="Profound" />

      {profoundIsDemo && (
        <div><SampleDataBadge /></div>
      )}

      {profoundData && (
        <>
          {profoundData.weeklyVisibility.length > 0 && (
            <ProfoundVisibilityChart
              data={profoundData.weeklyVisibility}
              competitorData={profoundData.competitorWeeklyVisibility}
              brandName={profoundYou?.name ?? process.env.PROFOUND_AI_YOUR_BRAND}
            />
          )}

          {profoundYou && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {[
                {
                  title: 'Visibility',
                  value: `${profoundYou.visibility.toFixed(1)}%`,
                  delta: profoundYou.visibilityDelta,
                  subtitle: `Competitor avg · ${profoundData.competitorAverages.visibility.toFixed(1)}%`,
                  tooltip: `${PROFOUND.visibility.text} (Profound.) Shown YTD vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                },
                {
                  title: 'Share of Voice',
                  value: `${profoundYou.sov.toFixed(1)}%`,
                  delta: profoundYou.sovDelta,
                  subtitle: `Competitor avg · ${profoundData.competitorAverages.sov.toFixed(1)}%`,
                  tooltip: `${PROFOUND.sov.text} (Profound.) Shown YTD vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
                },
                {
                  title: 'Position',
                  value: `#${profoundYou.position.toFixed(1)}`,
                  delta: profoundYou.positionDelta,
                  subtitle: `Competitor avg · #${profoundData.competitorAverages.position.toFixed(1)}`,
                  tooltip: `${PROFOUND.position.text} (Profound.) Shown YTD vs. same period last year.`,
                  invertDelta: true,
                },
              ].map(({ title, value, delta, tooltip, subtitle, invertDelta }) => (
                <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} invertDelta={invertDelta} />
              ))}
            </div>
          )}

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
            <ProfoundTopDomainsTable domainsByRange={profoundData.domainsByRange} totalCitationsByRange={profoundData.totalCitationsByRange} />
            <div className="flex flex-col gap-5">
              <DomainTypesChart types={profoundData.domainTypes} source="profound" />
              <DomainTypeDefinitions source="profound" />
            </div>
          </div>

          {profoundData.trackedPrompts.length > 0 && (
            <ProfoundTrackedPromptsChart prompts={profoundData.trackedPrompts} />
          )}

          <p className="text-xs text-text-muted">{profoundIsDemo ? 'Sample data — demo mode' : 'Live data from Profound'}</p>
        </>
      )}

    </div>
  )
}
