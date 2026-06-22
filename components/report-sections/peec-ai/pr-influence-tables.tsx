'use client'

import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'
import { cn } from '@/lib/utils'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC, GA4, PR_PROOF } from '@/lib/peec/metric-definitions'
import { InfoTooltip } from '@/components/ui/info-tooltip'

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
        <InfoTooltip text={tooltip} />
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
  avgCitations: number | null
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
        r.promptCount != null ? (
          <span className="tabular-nums text-white">{r.promptCount}</span>
        ) : (
          <span className="tabular-nums text-white">--</span>
        ),
    },
    {
      key: 'avgCitations',
      label: 'Avg. Citations',
      align: 'right',
      tooltip:
        "Average number of times this domain's URLs are cited per AI answer in which they appear (Peec AI — citation_avg). Higher = cited more often.",
      accessor: (r) => r.avgCitations ?? 0,
      render: (r) =>
        r.avgCitations != null ? (
          <span className="tabular-nums text-white/60">{r.avgCitations.toFixed(1)}</span>
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
          <span className={cn('tabular-nums', r.postPublishTrend >= 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
            {r.postPublishTrend >= 0 ? '↑' : '↓'} {Math.abs(r.postPublishTrend)}%
          </span>
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
            ' Linked Mention requires a PR Proof sheet column. Post-Publish Traffic Trend requires GA4 integration.'}
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
  avgCitations: number | null
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
}: {
  rows: TopEditorialDomainRow[]
}) {
  const maxRetrieved = Math.max(...rows.map((r) => r.citationCount), 1)

  const columns: SortableColumn<TopEditorialDomainRow>[] = [
    {
      key: 'domain',
      label: 'Domain',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="font-medium text-white/80" title={r.domain}>
          {r.domain}
        </span>
      ),
    },
    {
      key: 'citationCount',
      label: 'Citation Share',
      align: 'left',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.citationCount,
      render: (r) => {
        const barWidth = (r.citationCount / maxRetrieved) * 100
        return (
          <div className="flex items-center gap-2">
            <div className="h-4 w-24 overflow-hidden rounded bg-white/[0.04]">
              <div
                className="h-full rounded bg-[#39A0FF]/60"
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
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which editorial domains do AI engines cite most for our prompts?"
        tooltip={PEEC.sourceMetrics.text}
        subtitle="These domains are the most likely to surface as cited sources in AI-generated results, so they should be prioritized on the media target list."
      />
      {rows.length > 0 ? (
        <SortableTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.domain}
          initialPageSize={15}
          emptyMessage="No editorial domains found in current Peec AI project"
        />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">No editorial domains found in current Peec AI project</p>
        </div>
      )}
    </div>
  )
}

// ─── 3. Top Editorial Opportunities (FB-014, retitled from Brand-Absent) ─────

export interface BrandAbsentEditorialDomainRow {
  domain: string
  articleTitle: string | null
  articleUrl: string | null
  citationCount: number
  citationCountDelta: number
  competitorsMentioned: string | null
}

export function BrandAbsentEditorialDomainsTable({
  rows,
  hasEditorialDomains,
}: {
  rows: BrandAbsentEditorialDomainRow[]
  hasEditorialDomains: boolean
}) {
  const columns: SortableColumn<BrandAbsentEditorialDomainRow>[] = [
    {
      key: 'domain',
      label: 'Publication',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'articleTitle',
      label: 'Article',
      align: 'left',
      accessor: (r) => r.articleTitle ?? '',
      render: (r) => {
        if (!r.articleTitle && !r.articleUrl) {
          return <span className="text-white/20">--</span>
        }
        const text = r.articleTitle ?? r.articleUrl!.replace(/^https?:\/\//, '')
        if (r.articleUrl) {
          return (
            <a
              href={r.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[240px] truncate text-white/80 hover:text-[#39A0FF] hover:underline"
              title={r.articleTitle ?? r.articleUrl}
            >
              {text}
            </a>
          )
        }
        return <span className="block max-w-[240px] truncate text-white/80" title={text}>{text}</span>
      },
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
      key: 'citationCount',
      label: 'Citation Share',
      align: 'right',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.citationCount,
      render: (r) => <span className="tabular-nums text-white">{r.citationCount.toFixed(1)}%</span>,
    },
    {
      key: 'citationCountDelta',
      label: 'Delta of Citation Share',
      align: 'right',
      tooltip: 'Period-over-period change in this domain\'s citation share. (Peec AI source data.)',
      accessor: (r) => r.citationCountDelta,
      render: (r) => <CitationDelta value={r.citationCountDelta} />,
    },
  ]

  const emptyMessage = !hasEditorialDomains
    ? 'No editorial domain data available from Peec AI'
    : 'No brand-absent editorial domains with a positive citation share delta in this period.'

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="What are the top pitch opportunities for getting our brand mentioned in AI?"
        tooltip={PEEC.sourceMetrics.text}
        subtitle="Prompt-level citations on the rise where your brand is not mentioned, revealing outreach opportunities that may require different strategies depending on the type of article being cited."
      />
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={20}
        emptyMessage={emptyMessage}
      />
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
  // FB-012 — simple horizontal bar chart: Topic × % citation share from editorial sources.
  // Sorted descending so the top opportunity is at the top.
  const chartData = [...rows]
    .sort((a, b) => b.editorialCitationDensity - a.editorialCitationDensity)
    .map((r) => ({
      topic: r.cluster,
      value: Number(r.editorialCitationDensity.toFixed(1)),
    }))
  const chartHeight = Math.max(220, chartData.length * 34 + 40)

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which prompt clusters offer the biggest PR opportunity?"
        tooltip={PEEC.citations.text}
        subtitle="Topics ranked by share of citations earned from editorial sources. Higher share means a stronger candidate for the next PR pitch."
      />
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsBarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            barCategoryGap={8}
          >
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fill: '#8A8A8A', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="topic"
              width={120}
              tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              cursor={{ fill: 'rgba(57,160,255,0.06)' }}
              contentStyle={{
                background: '#272727',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                color: '#FFFFFF',
                fontSize: '12px',
              }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Citation Share']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {chartData.map((d) => (
                <Cell key={d.topic} fill="#39A0FF" />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No tracked prompts yet. Add prompts in Peec AI to populate the chart.
          </p>
        </div>
      )}
    </div>
  )
}

