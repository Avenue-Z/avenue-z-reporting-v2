'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const SOURCE_LABELS: Record<string, string> = {
  ORGANIC_SEARCH:  'Organic Search',
  PAID_SEARCH:     'Paid Search',
  SOCIAL_MEDIA:    'Social Media',
  PAID_SOCIAL:     'Paid Social',
  EMAIL_MARKETING: 'Email Marketing',
  REFERRALS:       'Referrals',
  DIRECT_TRAFFIC:  'Direct Traffic',
  OTHER_CAMPAIGNS: 'Other Campaigns',
  CONTENT:         'Content',
  Unknown:         'Unknown',
}

type SortKey = 'total' | 'icp' | 'mcp' | 'icpRate'

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

interface SourceRow {
  source:       string
  icp:          number
  mcp:          number
  unidentified: number
}

interface SourceQualityTableProps {
  data: SourceRow[]
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={cn('ml-1 text-[10px]', active ? 'text-white' : 'text-text-muted/40')}>
      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )
}

export function SourceQualityTable({ data }: SourceQualityTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const rows = data
    .map((row) => ({
      ...row,
      total:   row.icp + row.mcp + row.unidentified,
      icpRate: (row.icp + row.mcp + row.unidentified) > 0
        ? row.icp / (row.icp + row.mcp + row.unidentified)
        : 0,
    }))
    .sort((a, b) => {
      const av = a[sortKey] as number
      const bv = b[sortKey] as number
      return sortDir === 'desc' ? bv - av : av - bv
    })

  if (rows.length === 0) return null

  const colHdr = (key: SortKey, label: string) => (
    <button
      onClick={() => handleSort(key)}
      className="flex items-center font-semibold text-text-muted hover:text-white transition-colors"
    >
      {label}
      <SortIcon active={sortKey === key} dir={sortDir} />
    </button>
  )

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-5 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Source Performance</h3>
        <InlineTooltip text="Full-year 2026 inbound contacts by traffic source. ICP Rate = ICP ÷ Total — reveals which channels drive the best-quality leads, not just the highest volume." />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-widest">
              <th className="pb-2.5 text-left font-semibold text-text-muted">Source</th>
              <th className="pb-2.5 pr-4 text-right">{colHdr('total',   'Contacts')}</th>
              <th className="pb-2.5 pr-4 text-right">{colHdr('icp',     'ICP')}</th>
              <th className="pb-2.5 pr-4 text-right">{colHdr('mcp',     'MCP')}</th>
              <th className="pb-2.5 text-right">{colHdr('icpRate', 'ICP Rate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map((row) => (
              <tr key={row.source} className="group hover:bg-white/[0.02]">
                <td className="py-2.5 pr-4 font-medium text-white/80">
                  {SOURCE_LABELS[row.source] ?? row.source}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-white">
                  {row.total.toLocaleString()}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-white">
                  {row.icp.toLocaleString()}
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums text-white">
                  {row.mcp.toLocaleString()}
                </td>
                <td className="py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: row.icpRate >= 0.4 ? '#60FF80' : row.icpRate >= 0.2 ? '#FFD060' : '#8A8A8A' }}
                >
                  {(row.icpRate * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
