'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FormPerformanceEntry, FormMetaEntry } from '@/lib/hubspot/client'

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

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={cn('ml-1 text-[10px]', active ? 'text-white' : 'text-text-muted/40')}>
      {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
    </span>
  )
}

function icpRateColor(rate: number): string {
  if (rate >= 0.5) return '#60FF80'
  if (rate >= 0.2) return '#FFD060'
  return '#8A8A8A'
}

function displayFormName(name: string): string {
  if (name === '(Direct / Unknown)') return 'No form / direct'
  return name
}

interface FormPerformanceTableProps {
  data:         FormPerformanceEntry[]
  compareData?: FormPerformanceEntry[]
  metadata?:    FormMetaEntry[]
}

function delta(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

export function FormPerformanceTable({ data, compareData, metadata: _metadata }: FormPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const compareMap = compareData
    ? Object.fromEntries(compareData.map((r) => [r.formName, r]))
    : null

  const enriched = data.map((row) => ({
    ...row,
    icpRate: row.total > 0 ? row.icp / row.total : 0,
    prior:   compareMap?.[row.formName] ?? null,
  }))

  const sorted = [...enriched].sort((a, b) => {
    const av = a[sortKey] as number
    const bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  // Quality view: sorted by ICP rate, min 5 submissions
  const qualitySorted = [...enriched]
    .filter((r) => r.total >= 5 && r.formName !== '(Direct / Unknown)')
    .sort((a, b) => b.icpRate - a.icpRate)

  if (data.length === 0) return null

  const colHdr = (key: SortKey, label: string) => (
    <button
      onClick={() => handleSort(key)}
      className="flex items-center font-semibold text-text-muted hover:text-white transition-colors"
    >
      {label}
      <SortIcon active={sortKey === key} dir={sortDir} />
    </button>
  )

  const TableBody = ({ rows }: { rows: typeof sorted }) => (
    <tbody className="divide-y divide-white/[0.04]">
      {rows.map((row) => {
        const d = row.prior ? delta(row.total, row.prior.total) : null
        return (
          <tr key={row.formName} className="hover:bg-white/[0.02]">
            <td className="py-2.5 pr-4">
              <span className="font-medium text-white/80">{displayFormName(row.formName)}</span>
            </td>
            <td className="py-2.5 pr-4 text-right tabular-nums">
              <span className="text-white">{row.total.toLocaleString()}</span>
              {d !== null && (
                <span
                  className="ml-2 text-[10px] font-bold"
                  style={{ color: d >= 0 ? '#60FF80' : '#FF4444' }}
                >
                  {d >= 0 ? '↑' : '↓'}{Math.abs(d).toFixed(0)}%
                </span>
              )}
            </td>
            <td className="py-2.5 pr-4 text-right tabular-nums text-white">{row.icp.toLocaleString()}</td>
            <td className="py-2.5 pr-4 text-right tabular-nums text-white">{row.mcp.toLocaleString()}</td>
            <td className="py-2.5 text-right tabular-nums font-semibold" style={{ color: icpRateColor(row.icpRate) }}>
              {(row.icpRate * 100).toFixed(1)}%
            </td>
          </tr>
        )
      })}
    </tbody>
  )

  return (
    <div className="space-y-6">
      {/* Main table */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
        <div className="mb-5 flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Form Performance</h3>
          <InlineTooltip text="Contacts captured by each HubSpot form in the selected date range (by first-touch form attribution). ICP Rate = ICP ÷ total submissions." />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-widest">
                <th className="pb-2.5 text-left font-semibold text-text-muted">Form</th>
                <th className="pb-2.5 pr-4 text-right">{colHdr('total',   'Submissions')}</th>
                <th className="pb-2.5 pr-4 text-right">{colHdr('icp',     'ICP')}</th>
                <th className="pb-2.5 pr-4 text-right">{colHdr('mcp',     'MCP')}</th>
                <th className="pb-2.5 text-right">{colHdr('icpRate', 'ICP Rate')}</th>
              </tr>
            </thead>
            <TableBody rows={sorted} />
          </table>
        </div>
      </div>

      {/* Top forms by quality */}
      {qualitySorted.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
          <div className="mb-5 flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">Top Forms by Lead Quality</h3>
            <InlineTooltip text="Forms sorted by ICP Rate — reveals high-quality, potentially under-promoted forms worth more investment. Minimum 5 submissions to qualify." />
          </div>
          <div className="space-y-3">
            {qualitySorted.map((row, i) => (
              <div key={row.formName} className="flex items-center gap-4">
                <span className="w-5 shrink-0 text-right text-[11px] font-bold text-text-muted/50">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white/80">{displayFormName(row.formName)}</p>
                  <p className="text-[11px] text-text-muted">{row.total.toLocaleString()} submissions</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-extrabold tabular-nums" style={{ color: icpRateColor(row.icpRate) }}>
                    {(row.icpRate * 100).toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-text-muted">ICP Rate</p>
                </div>
                {/* Mini bar */}
                <div className="w-24 shrink-0">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.icpRate * 100}%`,
                        backgroundColor: icpRateColor(row.icpRate),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
