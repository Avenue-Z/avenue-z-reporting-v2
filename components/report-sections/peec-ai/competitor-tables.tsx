'use client'

import { SortableTable, type SortableColumn } from './sortable-table'
import { renderDelta } from './content-impact-tables'
import { PEEC } from '@/lib/peec/metric-definitions'

const TT = {
  aiVisibility:   PEEC.retrieved.text,
  promptCoverage: 'Percentage of tracked prompts where this domain appears. (Avenue Z internal.)',
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Top Competitor / Corporate Domains Cited in AI (Section H.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorDomainsCitedRow {
  domain: string
  aiVisibility: number
  aiVisibilityDelta: number | null
  citationShare: number
  citationShareDelta: number | null
  promptCoverage: number | null
  promptCoverageDelta: number | null
}

export function CompetitorDomainsCitedTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorDomainsCitedRow[]
  emptyMessage: string
}) {
  const maxCitationShare = Math.max(...rows.map((r) => r.citationShare), 1)

  const columns: SortableColumn<CompetitorDomainsCitedRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="block max-w-[150px] truncate font-medium text-white/80" title={r.domain}>{r.domain}</span>
      ),
    },
    {
      key: 'aiVisibility', label: 'Source Visibility', align: 'right',
      tooltip: TT.aiVisibility,
      accessor: (r) => r.aiVisibility,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.aiVisibility.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'aiVisibilityDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.aiVisibilityDelta ?? null,
      render: (r) => renderDelta(r.aiVisibilityDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal, derived from Peec citation_count.)",
      accessor: (r) => r.citationShare,
      render: (r) => {
        const barWidth = (r.citationShare / maxCitationShare) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">{r.citationShare.toFixed(1)}%</span>
          </div>
        )
      },
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? null,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: TT.promptCoverage,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage}%` : '--'}
        </span>
      ),
    },
    {
      key: 'promptCoverageDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.promptCoverageDelta ?? null,
      render: (r) => renderDelta(r.promptCoverageDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60" data-export-keep-with-next="">Which competitor domains are winning for our target prompts?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Top Competitor / Corporate URLs Where Brand is Absent (Section H.2)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorUrlsBrandAbsentRow {
  domain: string
  articleTitle: string | null  // display text for the Article cell; falls back to url when null
  url: string                  // always present, always hyperlinked
  citationShare: number | null
  citationShareDelta: number | null
  competitorsMentioned: string | null
}

export function CompetitorUrlsBrandAbsentTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorUrlsBrandAbsentRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<CompetitorUrlsBrandAbsentRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'article', label: 'Article',
      accessor: (r) => r.articleTitle ?? r.url,
      render: (r) => {
        const text = r.articleTitle ?? r.url
        return (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate text-white/80 underline-offset-2 hover:underline"
            title={`${text} → ${r.url}`}
          >
            {text}
          </a>
        )
      },
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal, derived from Peec citation_count.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}
        </span>
      ),
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? null,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'competitorsMentioned', label: 'Competitors Mentioned',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) => r.competitorsMentioned
        ? <span className="text-white/70">{r.competitorsMentioned}</span>
        : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60" data-export-keep-with-next="">Where are we absent when competitors are cited or mentioned?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.domain}-${i}`}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

