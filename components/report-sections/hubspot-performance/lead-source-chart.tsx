'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DealData } from './pipeline-stage-accordion'

const COLORS = [
  '#60FDFF',
  '#6034FF',
  '#60FF80',
  '#FFFC60',
  '#FF6B8A',
  '#FF7A59',
  '#39A0FF',
  '#FF4500',
  '#96BF48',
  '#00A4EF',
]

export interface LeadSourceEntry {
  source: string
  count: number
  deals: DealData[]
}

interface LeadSourceChartProps {
  data: LeadSourceEntry[]
}

export function LeadSourceChart({ data }: LeadSourceChartProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const total = data.reduce((sum, d) => sum + d.count, 0)
  if (total === 0) return null

  const selectedEntry = data.find((d) => d.source === selected)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      {/* Bars */}
      <div className="space-y-3 p-6">
        {data.map((item, i) => {
          const pct = Math.round((item.count / total) * 100)
          const color = COLORS[i % COLORS.length]
          const isSelected = selected === item.source
          return (
            <button
              key={item.source}
              onClick={() => setSelected(isSelected ? null : item.source)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm text-left transition-opacity',
                selected && !isSelected ? 'opacity-40' : 'opacity-100'
              )}
            >
              <div className="w-36 shrink-0 truncate text-right text-xs text-text-muted">
                {item.source}
              </div>
              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                <div
                  className="h-full rounded-sm transition-all"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <div className="w-16 shrink-0 text-xs text-white">
                {item.count} <span className="text-text-muted">({pct}%)</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Deal table */}
      {selectedEntry && (
        <div className="border-t border-white/[0.06] bg-black/20">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Deal Name', 'Amount', 'Close Date', 'Owner', 'Time in Stage', 'Days Old'].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      'px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted',
                      i > 0 ? 'text-right' : 'pl-8 text-left'
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedEntry.deals.map((deal) => (
                <tr
                  key={deal.id}
                  className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                >
                  <td className="pl-8 pr-5 py-3">
                    <a
                      href={`https://app.hubspot.com/contacts/308777/record/0-3/${deal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-cyan hover:underline"
                    >
                      {deal.dealname || '—'}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-white">{deal.amount}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-white">{deal.closedate}</td>
                  <td className="px-5 py-3 text-right text-white">{deal.owner}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-white">{deal.timeInStage}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-text-muted">{deal.daysOld}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
