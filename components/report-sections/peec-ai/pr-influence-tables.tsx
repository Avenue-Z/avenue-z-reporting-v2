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
  citationCount: number              // d.retrieved (%) or model-scoped share %
  citationCountDelta: number | null  // null = no delta (e.g. model filter active; FB-063)
  promptCoverage: number | null
  avgCitations: number | null
  hasPR: boolean
}

function CitationDelta({ value }: { value: number | null }) {
  // FB-063: null means the delta is not meaningful in the current filter state
  // (e.g. model filter active with stale prior-period data). Render "--" rather
  // than a fake "↑0.0%" which would imply a real measured change of zero.
  if (value === null) {
    return <span className="text-xs text-white/30">--</span>
  }
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
        // FB-060: cap the table area to ~320px with internal scroll. The
        // sibling Prompt Cluster Opportunity card (right side of the same
        // lg:grid-cols-2 wrapper) has a natural height driven by its chart
        // (chartHeight = Math.max(200, len*24+36) ≈ 290px for ~11 clusters).
        // The grid uses default items-stretch, so before this cap the
        // taller editorial card forced the right card to stretch and show
        // ~180px of empty dead space below its chart. Now both cards land
        // at the same compact height; the editorial domains list scrolls
        // internally instead of pushing the card open.
        // initialPageSize bumped 15 -> 100 so pagination does not truncate
        // inside the scroll viewport.
        <div className="max-h-[320px] overflow-y-auto">
          <SortableTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.domain}
            initialPageSize={100}
            emptyMessage="No editorial domains found in current Peec AI project"
          />
        </div>
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
  citationShare: number       // FB-028: URL's share of total period AI citations, 0-100.
  citationShareDelta: number  // FB-028: current-period share minus prior-period share (percentage points).
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
        'Competing brands mentioned in this article. (Peec AI source data.)',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) =>
        r.competitorsMentioned ? (
          <span className="text-[11px] text-white/70">{r.competitorsMentioned}</span>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
    {
      key: 'citationShare',
      label: 'Citation Share',
      align: 'right',
      tooltip: "This URL's share of total tracked-AI citations in the selected period. (URL citation count divided by the sum across all AI-cited URLs in period.)",
      accessor: (r) => r.citationShare,
      render: (r) => <span className="tabular-nums text-white">{r.citationShare.toFixed(1)}%</span>,
    },
    {
      key: 'citationShareDelta',
      label: 'Delta of Citation Share',
      align: 'right',
      tooltip: "Period-over-period change in this URL's share of AI citations (percentage points).",
      accessor: (r) => r.citationShareDelta,
      render: (r) => <CitationDelta value={r.citationShareDelta} />,
    },
  ]

  const emptyMessage = !hasEditorialDomains
    ? 'No editorial domain data available from Peec AI'
    : 'No brand-absent editorial URLs cited by AI in this period or model selection.'

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
  // FB-019: tighter per-row spacing + explicit barSize so bars stay visually
  // prominent at the side-by-side height.
  const chartHeight = Math.max(200, chartData.length * 24 + 36)

  // FB-027 — dynamic X-axis upper bound. Tina v1 CSV R14: a 3.1% top value
  // against a 0-100 axis renders as anemic slivers. Round the max value up
  // to the next 5 (when max ≤ 10) or the next 10 (when max > 10). Falls back
  // to 5 when chartData is empty or max is exactly 0 so the axis still
  // renders gridlines.
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0
  const upper =
    maxValue === 0
      ? 5
      : maxValue <= 10
        ? Math.ceil(maxValue / 5) * 5
        : Math.ceil(maxValue / 10) * 10

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
            barCategoryGap={4}
          >
            <XAxis
              type="number"
              domain={[0, upper]}
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
                fontSize: '12px',
              }}
              labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
              itemStyle={{ color: '#FFFFFF' }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Citation Share']}
            />
            <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]}>
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

// ─── 5. PR Placement Matchback (FB-029 restored, FB-067 cited-in-timeframe) ──
// Tina's PRD ask: "Did placements achieved by the PR team get cited in AI? The
// dashboard must compare a maintained list of PR-secured placements against the
// list of editorial URLs cited in tracked AI answers." Tina 2026-07-09 refined
// it: the placement list is ALL TIME, and the card dynamically shows only
// placements CITED within the selected timeframe (not secured within it).
//
// FB-069 superseded the domain-level half of that: a placement now appears only
// when its own ARTICLE URL is cited, not merely some other page on its domain.
// The logic is computePlacementMatchback in lib/pr-proof/matchback.ts (pure,
// unit-tested); this component only renders the rows it returns.
//
// Columns: Publication + Article (which placement), Publish Date (when secured),
// First cited + Most recent (when it was cited), AI Engines (where). The
// "Cited by AI" column was removed in FB-069 Req 2 -- every row here is cited by
// construction, so it read "Yes" on every row and carried no information.

export interface PRPlacementMatchbackRow {
  outlet: string
  headline: string
  link: string
  publicationDate: string
  citedByAI: boolean
  aiEnginesCiting: string[]
  /** Earliest citation date for this placement's host (empty string when unknown). */
  firstCitedDate: string
  /** Most-recent citation date for this placement's host (empty string when unknown). */
  lastCitedDate: string
}

export function PRPlacementMatchbackTable({
  rows,
}: {
  rows: PRPlacementMatchbackRow[]
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
      key: 'headline',
      label: 'Article',
      align: 'left',
      accessor: (r) => r.headline,
      // FB-069 Req 3: a blank title used to render a zero-width <a> — an
      // invisible, clickable gap that read as a rendering bug rather than as
      // missing source data. It now surfaces as a visible warning so the gap is
      // noticed and fixed in the client's PR Proof sheet.
      //
      // Wording is deliberately audience-neutral. This table also renders in the
      // client portal (app/portal/[clientSlug]/reports), and there is no
      // role-gating precedent in report sections, so internal process language
      // ("add it to the PR Proof sheet") would be shown to clients too. The link
      // is preserved either way, so a missing title never costs the click-through.
      render: (r) =>
        r.headline ? (
          <a
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[280px] truncate text-white/80 hover:text-[#39A0FF] hover:underline"
            title={r.headline}
          >
            {r.headline}
          </a>
        ) : (
          <a
            href={r.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[280px] truncate font-medium text-amber-400/90 hover:text-amber-300 hover:underline"
            title="No article title has been recorded for this placement."
          >
            ⚠ Missing article title
          </a>
        ),
    },
    {
      key: 'publicationDate',
      label: 'Publish Date',
      align: 'left',
      accessor: (r) => r.publicationDate,
      render: (r) => (
        <span className="tabular-nums text-white/60">{r.publicationDate || '--'}</span>
      ),
    },
    {
      key: 'firstCitedDate',
      label: 'First cited',
      align: 'left',
      tooltip: 'Earliest date Peec AI observed a citation for this placement\'s domain, within the selected timeframe. (Peec AI source data.)',
      accessor: (r) => r.firstCitedDate,
      render: (r) => (
        <span className="tabular-nums text-white/60">{r.firstCitedDate || 'N/A'}</span>
      ),
    },
    {
      key: 'lastCitedDate',
      label: 'Most recent',
      align: 'left',
      tooltip: 'Most recent date Peec AI observed a citation for this placement\'s domain, within the selected timeframe. (Peec AI source data.)',
      accessor: (r) => r.lastCitedDate,
      render: (r) => (
        <span className="tabular-nums text-white/60">{r.lastCitedDate || 'N/A'}</span>
      ),
    },
    // FB-069 Req 2: the "Cited by AI" column was removed. Every row in this table
    // is a cited placement by construction (matchback.ts drops the rest), so the
    // column read "Yes" on every row and could never read anything else. The
    // MatchbackRow.citedByAI field is retained: it still documents that invariant
    // and is asserted in matchback.test.ts, it simply is not rendered.
    {
      key: 'aiEnginesCiting',
      label: 'AI Engines',
      align: 'left',
      tooltip:
        'List of AI engines (ChatGPT, Perplexity, Gemini, Claude, Copilot, Google) where this URL or its domain was cited. (Peec AI source data.)',
      accessor: (r) => r.aiEnginesCiting.join(', '),
      render: (r) =>
        r.aiEnginesCiting.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.aiEnginesCiting.map((e) => (
              <span
                key={e}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/80"
              >
                {e}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which secured PR placements are showing up in AI citations?"
        tooltip="Compares your PR-secured placements (PR Proof Library) against the editorial URLs cited in tracked AI answers (Peec AI)."
        subtitle="See which of your all-time secured PR placements are being cited in AI-generated answers within the selected timeframe, and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts."
      />
      {/* FB-069 Req 4: the "N of M placements cited by AI (X%)" line was removed.
          Its numerator counted placements cited within the selected date range
          while its denominator counted every placement ever secured, so the
          percentage compared two different bases and moved with the date picker
          for a reason no reader could infer. */}
      {rows.length > 0 ? (
        <SortableTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.link || r.headline}
          initialPageSize={15}
          emptyMessage="No PR placements cited by AI in the selected timeframe."
        />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No PR placements cited by AI in the selected timeframe.
          </p>
        </div>
      )}
    </div>
  )
}
