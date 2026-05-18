'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { BrandRanking } from '@/lib/profound/client'

function fmt(n: number, suffix = '%') {
  return `${n.toFixed(1)}${suffix}`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

function ColHeader({ label, tooltip, align }: { label: string; tooltip?: string; align: 'left' | 'right' | 'center' }) {
  return (
    <th className={cn('px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted', align === 'right' ? 'text-right' : align === 'center' ? 'text-center w-8' : 'text-left')}>
      {tooltip ? (
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
      ) : label}
    </th>
  )
}

const RANGE_KEYS = ['YTD', 'Last 30 days'] as const

const HEADERS: { label: string; tooltip?: string; align: 'left' | 'right' | 'center' }[] = [
  { label: '#',          align: 'center' },
  { label: 'Brand',      align: 'left' },
  { label: 'Visibility', align: 'right', tooltip: '% of AI responses that mention this brand.' },
  { label: 'SOV',        align: 'right', tooltip: "This brand's share of all AI brand mentions." },
  { label: 'Position',   align: 'right', tooltip: 'Avg rank when the brand appears in AI responses. Lower is better.' },
]

export function BrandRankingsTable({ rankingsByRange }: { rankingsByRange: Record<string, BrandRanking[]> }) {
  const [selectedRange, setSelectedRange] = useState<string>('YTD')
  const [showAll, setShowAll] = useState(false)

  const brands = rankingsByRange[selectedRange] ?? rankingsByRange['YTD'] ?? []
  const visible = showAll ? brands : brands.slice(0, 10)
  const showDeltas = selectedRange === 'YTD'

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Top Brands</p>
          <span className="group relative flex-shrink-0">
            <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              AI visibility comparison across all brands tracked in Profound.
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </span>
          </span>
        </div>
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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.04]">
            {HEADERS.map((h) => <ColHeader key={h.label} {...h} />)}
          </tr>
        </thead>
        <tbody>
          {visible.map((brand) => (
            <tr
              key={brand.rank}
              onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(brand.name)}`, '_blank', 'noopener,noreferrer')}
              className={cn(
                'border-b border-white/[0.03] transition-colors hover:bg-white/[0.02] cursor-pointer',
                brand.isYou && 'bg-white/[0.03]'
              )}
            >
              <td className="px-4 py-3 text-center text-xs text-text-muted">{brand.rank}</td>
              <td className="px-4 py-3">
                <span className={cn('text-sm font-semibold', brand.isYou ? 'text-[#60FDFF]' : 'text-white')}>
                  {brand.name}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="tabular-nums text-white">{fmt(brand.visibility)}</span>
                {showDeltas && <>{' '}<Delta value={brand.visibilityDelta} /></>}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="tabular-nums text-white">{fmt(brand.sov)}</span>
                {showDeltas && <>{' '}<Delta value={brand.sovDelta} /></>}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="tabular-nums text-white">#{brand.position.toFixed(1)}</span>
                {showDeltas && <>{' '}<Delta value={brand.positionDelta} invert /></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {brands.length > 10 && (
        <div className="border-t border-white/[0.04] px-5 py-3">
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-text-muted hover:text-white transition-colors"
          >
            {showAll ? 'Show less' : `See all ${brands.length} brands`}
          </button>
        </div>
      )}
    </div>
  )
}
