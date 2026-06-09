'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { BrandRanking } from '@/lib/peec/client'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC } from '@/lib/peec/metric-definitions'
import { InfoTooltip } from '@/components/ui/info-tooltip'

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('ml-1 text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

const RANGE_KEYS = ['YTD', 'Last 30 days'] as const

export function BrandRankingsTable({ rankingsByRange }: { rankingsByRange: Record<string, BrandRanking[]> }) {
  const [selectedRange, setSelectedRange] = useState<string>('YTD')

  const brands = rankingsByRange[selectedRange] ?? rankingsByRange['YTD'] ?? []
  const showDeltas = selectedRange === 'YTD'

  const columns: SortableColumn<BrandRanking>[] = [
    {
      key: 'rank',
      label: '#',
      align: 'center',
      sortable: true,
      filterable: false,
      width: '3rem',
      accessor: (r) => r.rank,
      render: (r) => <span className="text-xs text-text-muted">{r.rank}</span>,
    },
    {
      key: 'name',
      label: 'Brand',
      align: 'left',
      accessor: (r) => r.name,
      render: (r) => (
        <span className={cn('text-sm font-semibold', r.isYou ? 'text-[#60FDFF]' : 'text-white')}>{r.name}</span>
      ),
    },
    {
      key: 'visibility',
      label: 'Visibility',
      align: 'right',
      tooltip: PEEC.visibility.text,
      accessor: (r) => r.visibility,
      render: (r) => (
        <span className="tabular-nums text-white">
          {fmtPct(r.visibility)}
          {showDeltas && <Delta value={r.visibilityDelta} />}
        </span>
      ),
    },
    {
      key: 'sov',
      label: 'SOV',
      align: 'right',
      tooltip: PEEC.sov.text,
      accessor: (r) => r.sov,
      render: (r) => (
        <span className="tabular-nums text-white">
          {fmtPct(r.sov)}
          {showDeltas && <Delta value={r.sovDelta} />}
        </span>
      ),
    },
    {
      key: 'position',
      label: 'Position',
      align: 'right',
      tooltip: PEEC.position.text,
      accessor: (r) => r.position,
      render: (r) => (
        <span className="tabular-nums text-white">
          #{r.position.toFixed(1)}
          {showDeltas && <Delta value={r.positionDelta} invert />}
        </span>
      ),
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Which brands appear most often in AI answers?</p>
          <InfoTooltip text={`Brand visibility across all brands tracked in Peec AI. ${PEEC.visibility.text}`} />
        </div>
        <select
          value={selectedRange}
          onChange={(e) => setSelectedRange(e.target.value)}
          className="cursor-pointer rounded-md border border-white/[0.08] bg-bg-surface px-3 py-1.5 text-xs font-semibold text-white focus:outline-none"
        >
          {RANGE_KEYS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <SortableTable
        columns={columns}
        rows={brands}
        rowKey={(r) => r.rank}
        initialPageSize={10}
        onRowClick={(r) => window.open(`https://www.google.com/search?q=${encodeURIComponent(r.name)}`, '_blank', 'noopener,noreferrer')}
        rowClassName={(r) => (r.isYou ? 'bg-white/[0.03]' : '')}
        emptyMessage="No brand rankings available."
      />
    </div>
  )
}
