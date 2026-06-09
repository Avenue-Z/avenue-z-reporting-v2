'use client'

import { cn } from '@/lib/utils'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC, GA4, PR_PROOF } from '@/lib/peec/metric-definitions'

// ─── Shared helpers ──────────────────────────────────────────────────────────

function fmtPct(n: number, decimals = 1) {
  return `${n.toFixed(decimals)}%`
}

// Section heading + section-level "?" tooltip wrapper. Each component composes
// its own outer card with this heading INSIDE so pr-influence.tsx just renders
// `<XTable rows={…} />`.
function SectionHeading({ title, tooltip, subtitle }: { title: string; tooltip: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            {tooltip}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </span>
        </span>
      </div>
      {subtitle && <p className="mt-1 text-xs text-text-muted">{subtitle}</p>}
    </div>
  )
}

// ─── 1. PR Placement Matchback ───────────────────────────────────────────────

export interface PRPlacementMatchbackRow {
  outlet: string
  domain: string
  headline: string
  link: string
  publicationDate: string
  promptCluster: string | null
  brandMentioned: boolean
  linkedMention: boolean | null
  citedByAI: boolean
  aiEnginesCiting: string
  promptCount: number | null
  averagePosition: number | null
  postPublishTrend: number | null
}

const AI_ENGINES_TOOLTIP =
  'List of AI engines (ChatGPT, Perplexity, Gemini, Claude, etc.) where this URL or domain was cited. (Peec AI source data.)'

const POST_PUBLISH_TOOLTIP =
  'AI-referred sessions to this URL after publication, from GA4 filtered to AI referrer domains. (Avenue Z internal — GA4.)'

export function PRPlacementMatchbackTable({
  rows,
  totalPlacements,
  placementsCitedByAI,
  prDataAvailable,
  isDemo,
}: {
  rows: PRPlacementMatchbackRow[]
  totalPlacements: number
  placementsCitedByAI: number
  prDataAvailable: boolean
  isDemo: boolean
}) {
  const columns: SortableColumn<PRPlacementMatchbackRow>[] = [
    {
      key: 'outlet',
      label: 'Publication',
      align: 'left',
      accessor: (r) => r.outlet,
      render: (r) => <span className="font-medium text-white">{r.outlet}</span>,
    },
    {
      key: 'domain',
      label: 'Domain',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-mono text-[10px] text-white/60">{r.domain}</span>,
    },
    {
      key: 'headline',
      label: 'Article Title',
      align: 'left',
      accessor: (r) => r.headline,
      render: (r) => (
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[200px] truncate text-[#39A0FF] hover:underline"
          title={r.headline}
        >
          {r.headline.length > 50 ? `${r.headline.slice(0, 50)}...` : r.headline}
        </a>
      ),
    },
    {
      key: 'link',
      label: 'Article URL',
      align: 'left',
      accessor: (r) => r.link,
      render: (r) => (
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[140px] truncate font-mono text-[10px] text-white/40 hover:text-[#39A0FF]"
          title={r.link}
        >
          {r.domain}
        </a>
      ),
    },
    {
      key: 'publicationDate',
      label: 'Publish Date',
      align: 'left',
      accessor: (r) => r.publicationDate,
      render: (r) => <span className="tabular-nums text-white/60">{r.publicationDate}</span>,
    },
    {
      key: 'promptCluster',
      label: 'Prompt Cluster',
      align: 'left',
      tooltip:
        'Topical group the prompt belongs to (e.g. Discovery, Comparison, How-to). Used to match PR coverage to query intent. (Avenue Z internal.)',
      accessor: (r) => r.promptCluster ?? '',
      render: (r) =>
        r.promptCluster ? (
          <span className="text-white/70">{r.promptCluster}</span>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
    {
      key: 'prSecured',
      label: 'PR Secured',
      align: 'left',
      tooltip: PR_PROOF.placement.text,
      sortable: false,
      filterable: false,
      accessor: () => 'Yes',
      render: () => (
        <span className="rounded-full bg-[#60FF80]/10 px-2 py-0.5 text-[10px] font-semibold text-[#60FF80]">Yes</span>
      ),
    },
    {
      key: 'brandMentioned',
      label: 'Brand Mentioned',
      align: 'left',
      tooltip: PEEC.brandVisibility.text,
      accessor: (r) => (r.brandMentioned ? 1 : 0),
      render: (r) => (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            r.brandMentioned ? 'bg-[#60FF80]/10 text-[#60FF80]' : 'bg-white/[0.06] text-white/40',
          )}
        >
          {r.brandMentioned ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'linkedMention',
      label: 'Linked Mention',
      align: 'left',
      tooltip:
        'Whether the placement includes a hyperlink back to the brand site (vs. a text-only mention). (Avenue Z internal.)',
      accessor: (r) => (r.linkedMention == null ? -1 : r.linkedMention ? 1 : 0),
      render: (r) =>
        r.linkedMention == null ? (
          <span className="text-white/40">--</span>
        ) : (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              r.linkedMention ? 'bg-[#60FF80]/10 text-[#60FF80]' : 'bg-white/[0.06] text-white/40',
            )}
          >
            {r.linkedMention ? 'Yes' : 'No'}
          </span>
        ),
    },
    {
      key: 'citedByAI',
      label: 'Cited by AI',
      align: 'left',
      tooltip:
        'Whether this URL or its domain has been cited by any tracked AI engine in Peec AI data. (Peec AI source data.)',
      accessor: (r) => (r.citedByAI ? 1 : 0),
      render: (r) => (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            r.citedByAI ? 'bg-[#60FDFF]/10 text-[#60FDFF]' : 'bg-white/[0.06] text-white/40',
          )}
        >
          {r.citedByAI ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'aiEnginesCiting',
      label: 'AI Engines',
      align: 'left',
      tooltip: AI_ENGINES_TOOLTIP,
      accessor: (r) => r.aiEnginesCiting,
      render: (r) =>
        r.aiEnginesCiting ? (
          <span className="text-white/70">{r.aiEnginesCiting}</span>
        ) : (
          <span className="text-white/60">--</span>
        ),
    },
    {
      key: 'promptCount',
      label: 'Prompt Count',
      align: 'right',
      tooltip:
        'Number of tracked prompts where this URL or its domain appears as a citation. (Peec AI source data.)',
      accessor: (r) => r.promptCount ?? 0,
      render: (r) =>
        r.promptCount != null && r.promptCount > 0 ? (
          <span className="tabular-nums text-white">{r.promptCount}</span>
        ) : (
          <span className="tabular-nums text-white">--</span>
        ),
    },
    {
      key: 'averagePosition',
      label: 'Avg Position',
      align: 'right',
      tooltip: PEEC.position.text,
      accessor: (r) => r.averagePosition ?? Number.POSITIVE_INFINITY,
      render: (r) =>
        r.averagePosition != null ? (
          <span className="tabular-nums text-white/60">#{r.averagePosition.toFixed(1)}</span>
        ) : (
          <span className="tabular-nums text-white/60">--</span>
        ),
    },
    {
      key: 'postPublishTrend',
      label: 'Post-Publish Traffic Trend',
      align: 'right',
      tooltip: POST_PUBLISH_TOOLTIP,
      accessor: (r) => r.postPublishTrend ?? 0,
      render: (r) =>
        r.postPublishTrend != null ? (
          <span className="tabular-nums text-[#60FF80]">↑ {r.postPublishTrend}%</span>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
  ]

  const emptyMessage = !prDataAvailable
    ? 'PR Proof Library not connected. Add prProofSheetId to clients.config.ts.'
    : totalPlacements === 0
      ? 'No PR placements found for this client in the PR Proof Library.'
      : 'No matchback data available.'

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which PR placements are being cited in AI?"
        tooltip={PR_PROOF.matchback.text}
        subtitle="Each secured PR placement matched against Peec AI citation data. Shows which earned media is being retrieved by AI engines and whether your brand is mentioned."
      />
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.link}-${i}`}
        initialPageSize={25}
        emptyMessage={emptyMessage}
      />
      {rows.length > 0 && (
        <p className="mt-4 text-[10px] text-text-muted">
          Showing {rows.length} placements across 14 columns. {placementsCitedByAI} cited by AI engines.
          {!isDemo &&
            ' Prompt Cluster and Linked Mention require URL-level citation data. Post-Publish Traffic Trend requires GA4 integration.'}
        </p>
      )}
    </div>
  )
}

// ─── 2. Top Editorial Domains Cited by AI ────────────────────────────────────

export interface TopEditorialDomainRow {
  domain: string
  citationCount: number      // d.retrieved (%)
  citationCountDelta: number // d.retrievedDelta
  promptCoverage: number | null
  avgPosition: number | null
  hasPR: boolean
}

function CitationDelta({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '↑' : '↓'}
      {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function TopEditorialDomainsTable({
  rows,
  isDemo,
}: {
  rows: TopEditorialDomainRow[]
  isDemo: boolean
}) {
  const maxRetrieved = Math.max(...rows.map((r) => r.citationCount), 1)

  const columns: SortableColumn<TopEditorialDomainRow>[] = [
    {
      key: 'domain',
      label: 'Domain',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className={cn('font-medium', r.hasPR ? 'text-[#60FF80]' : 'text-white/80')} title={r.domain}>
          {r.domain}
        </span>
      ),
    },
    {
      key: 'citationCount',
      label: 'Citation Count',
      align: 'left',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.citationCount,
      render: (r) => {
        const barWidth = (r.citationCount / maxRetrieved) * 100
        return (
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 overflow-hidden rounded bg-white/[0.04]">
              <div
                className={cn('h-full rounded', r.hasPR ? 'bg-[#60FF80]/60' : 'bg-[#39A0FF]/60')}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="tabular-nums text-white/60">{fmtPct(r.citationCount)}</span>
            <CitationDelta value={r.citationCountDelta} />
          </div>
        )
      },
    },
    {
      key: 'promptCoverage',
      label: 'Prompt Coverage %',
      align: 'left',
      tooltip: PR_PROOF.promptCoverage.text,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage != null ? `${r.promptCoverage}%` : '--'}
        </span>
      ),
    },
    {
      key: 'avgPosition',
      label: 'Avg Position',
      align: 'left',
      tooltip: PEEC.position.text,
      accessor: (r) => r.avgPosition ?? Number.POSITIVE_INFINITY,
      render: (r) => (
        <span className="tabular-nums text-white/30">
          {r.avgPosition != null ? `#${r.avgPosition.toFixed(1)}` : '--'}
        </span>
      ),
    },
    {
      key: 'hasPR',
      label: 'PR',
      align: 'left',
      tooltip: PR_PROOF.placement.text,
      accessor: (r) => (r.hasPR ? 1 : 0),
      render: (r) =>
        r.hasPR ? (
          <span className="rounded-full bg-[#60FF80]/10 px-2 py-0.5 text-[9px] font-semibold text-[#60FF80]">
            Yes
          </span>
        ) : isDemo ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-semibold text-white/40">No</span>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which editorial domains do AI engines cite most for our prompts?"
        tooltip={PEEC.sourceMetrics.text}
        subtitle="Editorial domains most frequently retrieved in AI responses. These outlets carry LLM citation weight; securing coverage here has direct AEO impact."
      />
      {rows.length > 0 ? (
        <>
          <SortableTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.domain}
            initialPageSize={15}
            emptyMessage="No editorial domains found in current Peec AI project"
          />
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-[#39A0FF]/60" />
              <span className="text-[10px] text-text-muted">Editorial domain</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-[#60FF80]/60" />
              <span className="text-[10px] text-text-muted">Has PR placement</span>
            </div>
            {!isDemo && (
              <span className="ml-auto text-[10px] text-text-muted">
                Avg Position requires per-domain position data from Peec AI Pro
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">No editorial domains found in current Peec AI project</p>
        </div>
      )}
    </div>
  )
}

// ─── 3. Brand-Absent Editorial Domains ───────────────────────────────────────

export interface BrandAbsentEditorialDomainRow {
  domain: string
  articleTitle: string | null
  articleUrl: string | null
  citationCount: number
  competitorsMentioned: string | null
  brandMentioned: boolean // always false in this table by definition
  opportunityPriority: 'High' | 'Medium' | 'Low'
  suggestedAngle: string
}

export function BrandAbsentEditorialDomainsTable({
  rows,
  hasEditorialDomains,
  isDemo,
}: {
  rows: BrandAbsentEditorialDomainRow[]
  hasEditorialDomains: boolean
  isDemo: boolean
}) {
  const priorityRank = (p: 'High' | 'Medium' | 'Low') => (p === 'High' ? 3 : p === 'Medium' ? 2 : 1)

  const columns: SortableColumn<BrandAbsentEditorialDomainRow>[] = [
    {
      key: 'domain',
      label: 'Domain',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'articleTitle',
      label: 'Article Title',
      align: 'left',
      accessor: (r) => r.articleTitle ?? '',
      render: (r) =>
        r.articleTitle ? (
          <span className="text-white/80">{r.articleTitle}</span>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
    {
      key: 'articleUrl',
      label: 'URL',
      align: 'left',
      accessor: (r) => r.articleUrl ?? '',
      render: (r) =>
        r.articleUrl ? (
          <a
            href={r.articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[160px] truncate font-mono text-[10px] text-white/40 hover:text-[#39A0FF]"
            title={r.articleUrl}
          >
            {r.articleUrl.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
    {
      key: 'citationCount',
      label: 'Citation Count',
      align: 'right',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.citationCount,
      render: (r) => <span className="tabular-nums text-white">{r.citationCount.toFixed(1)}%</span>,
    },
    {
      key: 'competitorsMentioned',
      label: 'Competitors Mentioned',
      align: 'left',
      tooltip:
        'Competing brands mentioned in this article or by this domain in AI responses. (Avenue Z internal.)',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) =>
        r.competitorsMentioned ? (
          <span className="text-[11px] text-white/70">{r.competitorsMentioned}</span>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
    {
      key: 'brandMentioned',
      label: 'Brand Mentioned',
      align: 'left',
      tooltip: PEEC.brandVisibility.text,
      sortable: false,
      filterable: false,
      accessor: () => 0,
      render: () => (
        <span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">No</span>
      ),
    },
    {
      key: 'opportunityPriority',
      label: 'Opportunity Priority',
      align: 'left',
      tooltip: PR_PROOF.opportunityScore.text,
      accessor: (r) => priorityRank(r.opportunityPriority),
      render: (r) => {
        const color =
          r.opportunityPriority === 'High'
            ? 'bg-[#FF4444]/10 text-[#FF4444]'
            : r.opportunityPriority === 'Medium'
              ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
              : 'bg-white/[0.06] text-white/40'
        return (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color)}>
            {r.opportunityPriority}
          </span>
        )
      },
    },
    {
      key: 'suggestedAngle',
      label: 'Suggested PR Angle',
      align: 'left',
      tooltip: 'Suggested narrative for an Avenue Z pitch to this outlet. (Avenue Z internal.)',
      accessor: (r) => r.suggestedAngle,
      render: (r) => <span className="text-[11px] text-white/40">{r.suggestedAngle}</span>,
    },
  ]

  const emptyMessage = !hasEditorialDomains
    ? 'No editorial domain data available from Peec AI'
    : 'All editorial domains have PR placements. Great coverage!'

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which editorial domains cite our competitors but not us?"
        tooltip={PEEC.sourceMetrics.text}
        subtitle="High-authority editorial domains that AI tools cite for your tracked prompts, but where your brand has no PR placement. These are the highest-priority pitch targets."
      />
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={20}
        emptyMessage={emptyMessage}
      />
      {!isDemo && rows.length > 0 && (
        <p className="mt-4 text-[10px] text-text-muted">
          Article Title and URL require URL-level citation data from Peec AI (currently domain-level only). Citation
          Count shown as retrieved frequency %. Competitors Mentioned requires competitor mention extraction.
        </p>
      )}
    </div>
  )
}

// ─── 4. Prompt Cluster Opportunity Matrix ────────────────────────────────────

export interface PromptClusterOpportunityRow {
  cluster: string
  count: number
  editorialCitationDensity: number
  brandCitationRate: number
  brandMentionRate: number // avgVisibility
  competitorPresence: number
  opportunityScore: number
}

export function PromptClusterOpportunityMatrix({
  rows,
}: {
  rows: PromptClusterOpportunityRow[]
}) {
  const columns: SortableColumn<PromptClusterOpportunityRow>[] = [
    {
      key: 'cluster',
      label: 'Prompt Cluster',
      align: 'left',
      accessor: (r) => r.cluster,
      render: (r) => <span className="font-semibold text-white/80">{r.cluster}</span>,
    },
    {
      key: 'count',
      label: 'Prompts',
      align: 'right',
      tooltip: 'Number of tracked prompts in this cluster. (Peec AI source data.)',
      accessor: (r) => r.count,
      render: (r) => <span className="tabular-nums text-white">{r.count}</span>,
    },
    {
      key: 'editorialCitationDensity',
      label: 'Editorial Citation Density',
      align: 'left',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.editorialCitationDensity,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[#39A0FF]"
              style={{ width: `${Math.min(r.editorialCitationDensity, 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-white/60">{fmtPct(r.editorialCitationDensity)}</span>
        </div>
      ),
    },
    {
      key: 'brandCitationRate',
      label: 'Brand Citation Rate',
      align: 'left',
      tooltip: PEEC.citationRate.text,
      accessor: (r) => r.brandCitationRate,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[#60FF80]"
              style={{ width: `${Math.min(r.brandCitationRate, 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-white/60">{fmtPct(r.brandCitationRate)}</span>
        </div>
      ),
    },
    {
      key: 'brandMentionRate',
      label: 'Brand Mention Rate',
      align: 'right',
      tooltip: PEEC.brandVisibility.text,
      accessor: (r) => r.brandMentionRate,
      render: (r) => <span className="tabular-nums text-white/60">{fmtPct(r.brandMentionRate)}</span>,
    },
    {
      key: 'competitorPresence',
      label: 'Competitor Presence',
      align: 'left',
      tooltip: PEEC.sov.text,
      accessor: (r) => r.competitorPresence,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="h-1 w-12 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-[#FFFC60]"
              style={{ width: `${Math.min(r.competitorPresence, 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-white/60">{fmtPct(r.competitorPresence)}</span>
        </div>
      ),
    },
    {
      key: 'opportunityScore',
      label: 'Opportunity Score',
      align: 'right',
      tooltip: PR_PROOF.opportunityScore.text,
      accessor: (r) => r.opportunityScore,
      render: (r) => {
        const oppColor =
          r.opportunityScore > 40 ? '#60FF80' : r.opportunityScore > 20 ? '#FFFC60' : '#FF4444'
        return (
          <span className="text-sm font-bold tabular-nums" style={{ color: oppColor }}>
            {r.opportunityScore.toFixed(0)}
          </span>
        )
      },
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which prompt clusters offer the biggest PR opportunity?"
        tooltip={PR_PROOF.opportunityScore.text}
        subtitle="Clusters scored by opportunity: editorial citation density, brand absence, competitor presence, and publication tier. Highest opportunity clusters are where one strong PR placement can shift the AI conversation."
      />
      {rows.length > 0 ? (
        <>
          <SortableTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.cluster}
            emptyMessage="No prompt clusters available."
          />
          <p className="mt-4 text-[10px] text-text-muted">
            Opportunity Score = 35% editorial citation density + 30% brand absence + 20% competitor presence + 15%
            publication tier weight. Sorted by highest opportunity.
          </p>
        </>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No tracked prompts yet. Add prompts in Peec AI to populate the opportunity matrix.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── 5. Next Pitch Opportunities ─────────────────────────────────────────────

export interface NextPitchOpportunityRow {
  cluster: string
  missingDomain: string
  whyItMatters: string
  competitorPresence: number
  suggestedOutlet: string
  suggestedAngle: string
  priority: 'High' | 'Medium' | 'Low'
}

const NEXT_PITCH_TOOLTIP =
  'PR pitch suggestions ranked by opportunity score, generated from Peec AI citation data + PR Proof gaps + competitor presence. (Avenue Z internal.)'

export function NextPitchOpportunitiesTable({
  rows,
  emptyKind,
}: {
  rows: NextPitchOpportunityRow[]
  emptyKind: 'no-prompts' | 'no-gaps' | 'has-rows'
}) {
  const priorityRank = (p: 'High' | 'Medium' | 'Low') => (p === 'High' ? 3 : p === 'Medium' ? 2 : 1)

  const columns: SortableColumn<NextPitchOpportunityRow>[] = [
    {
      key: 'cluster',
      label: 'Prompt Cluster',
      align: 'left',
      accessor: (r) => r.cluster,
      render: (r) => <span className="font-semibold text-white/80">{r.cluster}</span>,
    },
    {
      key: 'missingDomain',
      label: 'Missing Domain / Outlet',
      align: 'left',
      tooltip:
        'Editorial domain that cites competitors in our tracked prompts but where we have no PR placement. (Avenue Z internal — Peec AI + PR Proof.)',
      accessor: (r) => r.missingDomain,
      render: (r) => <span className="font-mono text-[10px] text-white/60">{r.missingDomain}</span>,
    },
    {
      key: 'whyItMatters',
      label: 'Why It Matters',
      align: 'left',
      tooltip: 'Why this pitch opportunity moves brand visibility in AI answers. (Avenue Z internal.)',
      accessor: (r) => r.whyItMatters,
      render: (r) => <span className="text-[11px] text-white/50">{r.whyItMatters}</span>,
    },
    {
      key: 'competitorPresence',
      label: 'Competitor Presence',
      align: 'right',
      tooltip: PEEC.sov.text,
      accessor: (r) => r.competitorPresence,
      render: (r) => <span className="tabular-nums text-white/60">{fmtPct(r.competitorPresence)}</span>,
    },
    {
      key: 'suggestedOutlet',
      label: 'Suggested Outlet',
      align: 'left',
      tooltip: 'Recommended outlet to target. (Avenue Z internal.)',
      accessor: (r) => r.suggestedOutlet,
      render: (r) => <span className="text-white/60">{r.suggestedOutlet}</span>,
    },
    {
      key: 'suggestedAngle',
      label: 'Suggested Angle',
      align: 'left',
      tooltip: 'Suggested pitch angle for the outlet. (Avenue Z internal.)',
      accessor: (r) => r.suggestedAngle,
      render: (r) => <span className="text-[11px] text-white/50">{r.suggestedAngle}</span>,
    },
    {
      key: 'priority',
      label: 'Priority',
      align: 'left',
      tooltip: PR_PROOF.opportunityScore.text,
      accessor: (r) => priorityRank(r.priority),
      render: (r) => {
        const color =
          r.priority === 'High'
            ? 'bg-[#FF4444]/10 text-[#FF4444]'
            : r.priority === 'Medium'
              ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
              : 'bg-white/[0.06] text-white/40'
        return (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color)}>{r.priority}</span>
        )
      },
    },
  ]

  const emptyMessage =
    emptyKind === 'no-prompts'
      ? 'Add tracked prompts in Peec AI to generate pitch opportunities'
      : 'All editorial domains have PR coverage. Excellent position.'

  return (
    <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      <SectionHeading
        title="Where should we pitch next to close AI visibility gaps?"
        tooltip={NEXT_PITCH_TOOLTIP}
        subtitle="Pitch targets derived from prompt clusters with lowest brand visibility and highest editorial citation density."
      />
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.cluster}-${i}`}
        initialPageSize={8}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
