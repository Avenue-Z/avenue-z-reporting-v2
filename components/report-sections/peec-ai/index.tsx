import { getPeecOverview } from '@/lib/peec/client'
import type { DomainType, BrandRanking } from '@/lib/peec/client'
import { BRAND_TYPE_MAP, BRAND_TYPE_COLORS, BRAND_TYPE_DEFINITIONS } from '@/lib/peec/brand-types'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { VisibilityChart } from './visibility-chart'
import { TrackedPromptsChart } from './tracked-prompts-chart'
import { LLMBreakdownTable } from './llm-breakdown-table'
import { cn } from '@/lib/utils'

// --- Helpers ---

function fmt(n: number, suffix = '%') {
  return `${n.toFixed(1)}${suffix}`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

// --- Sub-components ---

function BrandSOVChart({ brands }: { brands: BrandRanking[] }) {
  // Aggregate SOV by inferred brand type, tracking brand names
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
  const typeDesc = Object.fromEntries(BRAND_TYPE_DEFINITIONS.map((d) => [d.type, d.desc]))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Brand Types</p>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-[#FF4444]/60 text-[9px] font-bold leading-none text-[#FF4444]">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Brand types are AI-inferred based on each brand's name and positioning. Verify accuracy before sharing externally.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-4">Avg share of voice by category</p>
      <div className="space-y-2.5">
        {rows.map(({ type, avgSov }) => (
          <div key={type} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-xs text-text-muted">{type}</div>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${(avgSov / maxSov) * 100}%`,
                  backgroundColor: BRAND_TYPE_COLORS[type] ?? '#8A8A8A',
                }}
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
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Brand Type Definitions</p>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-[#FF4444]/60 text-[9px] font-bold leading-none text-[#FF4444]">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Brand types are AI-inferred based on each brand's name and positioning. Verify accuracy before sharing externally.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
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

function DomainTypesChart({ types }: { types: DomainType[] }) {
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
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Domain Types</p>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Distribution of domain types across all sources retrieved by AI models.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
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


// --- Main report ---

export async function PeecAIReport() {
  const data = await getPeecOverview()

  const youBrand = data.brandRankings.find((b) => b.isYou)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Answer Engine Optimization
        </p>
        <h2 className="text-3xl font-extrabold uppercase text-white">
          Peec AI
        </h2>
      </div>

      {/* Visibility chart */}
      {data.weeklyVisibility.length > 0 && (
        <VisibilityChart
          data={data.weeklyVisibility}
          competitorData={data.competitorWeeklyVisibility}
          brandName={youBrand?.name ?? process.env.PEEC_AI_YOUR_BRAND}
        />
      )}

      {/* KPI cards */}
      {youBrand && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              title: 'Visibility',
              value: `${youBrand.visibility.toFixed(1)}%`,
              delta: youBrand.visibilityDelta,
              subtitle: `Competitor avg · ${data.competitorAverages.visibility.toFixed(1)}%`,
              tooltip: `% of AI responses mentioning your brand, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
            },
            {
              title: 'Share of Voice',
              value: `${youBrand.sov.toFixed(1)}%`,
              delta: youBrand.sovDelta,
              subtitle: `Competitor avg · ${data.competitorAverages.sov.toFixed(1)}%`,
              tooltip: `Your share of all AI brand mentions, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
            },
            {
              title: 'Position',
              value: `#${youBrand.position.toFixed(1)}`,
              delta: youBrand.positionDelta,
              subtitle: `Competitor avg · #${data.competitorAverages.position.toFixed(1)}`,
              tooltip: `Avg rank when your brand appears in AI responses (lower is better), Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.`,
              invertDelta: true,
            },
          ].map(({ title, value, delta, tooltip, subtitle, invertDelta }) => (
            <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} invertDelta={invertDelta} />
          ))}
        </div>
      )}

      {/* LLM breakdown */}
      {data.llmBreakdown.length > 0 && (
        <LLMBreakdownTable breakdown={data.llmBreakdown} />
      )}

      {/* Brand rankings + Brand types/definitions */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px] items-stretch">
        <BrandRankingsTable rankingsByRange={data.brandRankingsByRange} />
        <div className="flex flex-col gap-5 h-full">
          <BrandSOVChart brands={data.brandRankings} />
          <BrandDefinitions />
        </div>
      </div>

      {/* Top domains + Domain types */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <TopDomainsTable domainsByRange={data.domainsByRange} totalCitationsByRange={data.totalCitationsByRange} />
        <div className="flex flex-col gap-5">
          <DomainTypesChart types={data.domainTypes} />
          <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5 space-y-2.5">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Domain Type Definitions</p>
              <div className="group relative flex-shrink-0">
                <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                  Domain types are classified by Peec AI based on each domain's content and category.
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
                </div>
              </div>
            </div>
            {[
              { type: 'Own',          color: '#8A8A8A', desc: 'Your own owned domains.' },
              { type: 'Corporate',    color: '#8A8A8A', desc: 'Brand and company websites.' },
              { type: 'Competitor',   color: '#8A8A8A', desc: 'Competing brand domains.' },
              { type: 'UGC',          color: '#60FF80', desc: 'User-generated content — Reddit, Quora, forums, etc.' },
              { type: 'Editorial',    color: '#39A0FF', desc: 'News outlets and editorial publications.' },
              { type: 'Reference',    color: '#8A8A8A', desc: 'Wikipedia, databases, and directories.' },
              { type: 'Institutional',color: '#8A8A8A', desc: 'Academic, government, and non-profit sources.' },
              { type: 'Other',        color: '#8A8A8A', desc: 'Unclassified or miscellaneous domains.' },
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
        </div>
      </div>

      {/* Tracked prompts */}
      {data.trackedPrompts.length > 0 && (
        <TrackedPromptsChart prompts={data.trackedPrompts} />
      )}

      <p className="text-xs text-text-muted">Live data from Peec AI</p>
    </div>
  )
}

// Inline KPI card (no separate import needed)
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
          <div className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {tooltip}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </div>
          </div>
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
