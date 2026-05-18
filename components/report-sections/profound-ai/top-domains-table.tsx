'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { TopDomain } from '@/lib/profound/client'

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

const RANGE_KEYS = ['YTD', 'Last 30 days'] as const

function Delta({ value }: { value: number }) {
  const positive = value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

function ColHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  if (!tooltip) {
    return (
      <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-right first:text-left">
        {label}
      </th>
    )
  }
  return (
    <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-right">
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            {tooltip}
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </span>
        </span>
      </span>
    </th>
  )
}

export function TopDomainsTable({
  domainsByRange,
  totalCitationsByRange,
}: {
  domainsByRange: Record<string, TopDomain[]>
  totalCitationsByRange: Record<string, number>
}) {
  const [selectedRange, setSelectedRange] = useState<string>('YTD')
  const [showAll, setShowAll] = useState(false)

  const domains = domainsByRange[selectedRange] ?? domainsByRange['YTD'] ?? []
  const totalCitations = totalCitationsByRange[selectedRange] ?? 0
  const visible = showAll ? domains : domains.slice(0, 10)
  const showDeltas = selectedRange === 'YTD'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Top Domains</p>
          <span className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              Top domains cited by AI models, sourced from Profound.
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {totalCitations > 0 && (
            <p className="text-xs text-text-muted flex items-center gap-1">
              Total citations: <span className="font-semibold text-white">{totalCitations.toLocaleString()}</span>
              <span className="group relative flex-shrink-0">
                <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
                <span className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-52 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                  Total number of times any domain was cited across all AI responses in the selected period.
                  <span className="absolute right-2 top-full border-4 border-transparent border-t-white/[0.08]" />
                </span>
              </span>
            </p>
          )}
          <select
            value={selectedRange}
            onChange={(e) => { setSelectedRange(e.target.value); setShowAll(false) }}
            className="rounded-md border border-white/[0.08] bg-bg-surface px-3 py-1.5 text-xs font-semibold text-white focus:outline-none cursor-pointer"
          >
            {RANGE_KEYS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.04]">
            <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-center w-8">#</th>
            <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-left">Domain</th>
            <ColHeader label="Citation Share" tooltip="This domain's share of all AI citations in the selected period." />
            <ColHeader label="Count"          tooltip="Total number of times this domain was cited by AI models." />
            <ColHeader label="Type"           tooltip="Classification of the domain — e.g. UGC, Editorial, Corporate." />
          </tr>
        </thead>
        <tbody>
          {visible.map((d, i) => (
            <tr
              key={d.domain}
              onClick={() => window.open(`https://${d.domain}`, '_blank', 'noopener,noreferrer')}
              className={cn(
                'border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] cursor-pointer',
                d.type === 'Own' && 'bg-white/[0.03]'
              )}
            >
              <td className="px-5 py-3 text-center text-xs text-text-muted">{i + 1}</td>
              <td className="px-5 py-3">
                <span className={cn('text-sm font-semibold', d.type === 'Own' ? 'text-[#60FDFF]' : 'text-white')}>
                  {d.domain}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <span className="tabular-nums text-white">{d.retrieved.toFixed(1)}%</span>
                {showDeltas && <>{' '}<Delta value={d.retrievedDelta} /></>}
              </td>
              <td className="px-5 py-3 text-right">
                <span className="tabular-nums text-white">{Math.round(d.citationRate).toLocaleString()}</span>
                {showDeltas && <>{' '}<Delta value={d.citationRateDelta} /></>}
              </td>
              <td className="px-5 py-3 text-right">
                <span
                  className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    color: TYPE_COLORS[d.type] ?? '#8A8A8A',
                    backgroundColor: `${TYPE_COLORS[d.type] ?? '#8A8A8A'}22`,
                  }}
                >
                  {d.type}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {domains.length > 10 && (
        <div className="border-t border-white/[0.04] px-5 py-3">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-text-muted hover:text-white transition-colors"
          >
            {showAll ? 'Show less' : `See all ${domains.length} domains`}
          </button>
        </div>
      )}
    </div>
  )
}
