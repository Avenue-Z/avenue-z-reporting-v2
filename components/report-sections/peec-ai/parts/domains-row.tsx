import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { AVENUE_Z } from '@/lib/peec/metric-definitions'

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

export const domainsRowV1: PartImpl<PeecCtx> = {
  id: 'domains-row',
  version: 1,
  published: true,
  defaultLabel: 'Top Domains',
  render: (ctx) => {
    const { data, provider, Domains } = ctx
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Domains domains={data.topDomains} totalCitations={data.totalCitations} />
        <div className="flex flex-col gap-5">
          <DomainTypesChart types={data.domainTypes} source={provider} />
          <DomainTypeDefinitions source={provider} />
        </div>
      </div>
    )
  },
}
