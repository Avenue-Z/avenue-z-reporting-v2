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

