'use client'

import { cn } from '@/lib/utils'
import type { TopDomain } from '@/lib/profound/client'
import { PROFOUND } from '@/lib/peec/metric-definitions'
import { SortableTable, type SortableColumn } from '../peec-ai/sortable-table'
import { InfoTooltip } from '@/components/ui/info-tooltip'

const TYPE_COLORS: Record<string, string> = {
  Own:           '#8A8A8A',
  Corporate:     '#8A8A8A',
  Competitor:    '#8A8A8A',
  UGC:           '#60FF80',
  Editorial:     '#39A0FF',
  Reference:     '#8A8A8A',
  Institutional: '#8A8A8A',
  Other:         '#8A8A8A',
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={cn('ml-1 text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

export function TopDomainsTable({
  domains,
  totalCitations,
}: {
  domains: TopDomain[]
  totalCitations: number
}) {
  const showDeltas = true

  const columns: SortableColumn<TopDomain>[] = [
    {
      key: 'rank',
      label: '#',
      align: 'center',
      sortable: false,
      filterable: false,
      width: '3rem',
      render: (_, idx) => <span className="text-xs text-text-muted">{idx + 1}</span>,
    },
    {
      key: 'domain',
      label: 'Domain',
      align: 'left',
      accessor: (d) => d.domain,
      render: (d) => (
        <span className={cn('text-sm font-semibold', d.type === 'Own' ? 'text-[#60FDFF]' : 'text-white')}>
          {d.domain}
        </span>
      ),
    },
    {
      key: 'retrieved',
      label: 'Retrieved',
      align: 'right',
      tooltip: PROFOUND.visibility.text,
      accessor: (d) => d.retrieved,
      render: (d) => (
        <span className="tabular-nums text-white">
          {d.retrieved.toFixed(1)}%
          {showDeltas && <Delta value={d.retrievedDelta} />}
        </span>
      ),
    },
    {
      key: 'citationRate',
      label: 'Citation Rate',
      align: 'right',
      tooltip: PROFOUND.citationShare.text,
      accessor: (d) => d.citationRate,
      render: (d) => (
        <span className="tabular-nums text-white">
          {Math.round(d.citationRate).toLocaleString()}
          {showDeltas && <Delta value={d.citationRateDelta} />}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      align: 'right',
      tooltip: 'Classification of the domain — e.g. UGC, Editorial, Corporate. Classified by Profound based on the domain\'s content and category.',
      accessor: (d) => d.type,
      render: (d) => (
        <span
          className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold"
          style={{ color: TYPE_COLORS[d.type] ?? '#8A8A8A', backgroundColor: `${TYPE_COLORS[d.type] ?? '#8A8A8A'}22` }}
        >
          {d.type}
        </span>
      ),
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Which domains do AI engines cite most? (Profound)</p>
          <InfoTooltip text={PROFOUND.citationShare.text} />
        </div>
        {totalCitations > 0 && (
          <p className="flex items-center gap-1 text-xs text-text-muted">
            Total citations: <span className="font-semibold text-white">{totalCitations.toLocaleString()}</span>
            <InfoTooltip text={PROFOUND.citationShare.text} />
          </p>
        )}
      </div>
      <SortableTable
        columns={columns}
        rows={domains}
        rowKey={(d) => d.domain}
        initialPageSize={10}
        onRowClick={(d) => window.open(`https://${d.domain}`, '_blank', 'noopener,noreferrer')}
        rowClassName={(d) => (d.type === 'Own' ? 'bg-white/[0.03]' : '')}
        emptyMessage="No domain data available."
      />
    </div>
  )
}
