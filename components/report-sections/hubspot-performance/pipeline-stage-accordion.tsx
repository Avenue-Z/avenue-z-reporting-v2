'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DealData = {
  id: string
  dealname: string
  amount: string
  closedate: string
  owner: string
  timeInStage: string
  daysOld: string
}

export type StageData = {
  id: string
  label: string
  count: number
  totalValue: string
  weightedValue: string
  deals: DealData[]
}

export function PipelineStageAccordion({ stages, dealColumnLabel = 'Owner' }: { stages: StageData[]; dealColumnLabel?: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-bg-surface">
      {/* Header */}
      <div className="grid grid-cols-[1fr_72px_136px_152px_28px] border-b border-white/[0.06] px-5 py-3">
        {['Stage', 'Deals', 'Total Value', 'Weighted Value', ''].map((h, i) => (
          <span
            key={i}
            className={cn(
              'text-[11px] font-extrabold uppercase tracking-widest text-text-muted',
              i > 0 ? 'text-right' : ''
            )}
          >
            {h}
          </span>
        ))}
      </div>

      {stages.map((stage, si) => {
        const open = !!expanded[stage.id]
        return (
          <div key={stage.id} className={cn(si > 0 && 'border-t border-white/[0.04]')}>
            {/* Stage row */}
            <button
              onClick={() => toggle(stage.id)}
              className="grid w-full grid-cols-[1fr_72px_136px_152px_28px] items-center px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <span className="text-sm font-semibold text-white">{stage.label}</span>
              <span className="text-right text-sm tabular-nums text-text-muted">{stage.count}</span>
              <span className="text-right text-sm tabular-nums text-white">{stage.totalValue}</span>
              <span className="text-right text-sm tabular-nums text-brand-cyan">{stage.weightedValue}</span>
              <span className="flex justify-end">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-text-muted transition-transform duration-200',
                    open && 'rotate-180'
                  )}
                />
              </span>
            </button>

            {/* Expanded deals */}
            {open && (
              <div className="border-t border-white/[0.04] bg-black/20">
                {stage.deals.length === 0 ? (
                  <p className="px-8 py-4 text-sm text-text-muted">No deals in this stage.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.04]">
                        {['Deal Name', 'Amount', 'Close Date', dealColumnLabel, 'Time in Stage', 'Days Old'].map((h, i) => (
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
                      {stage.deals.map((deal) => (
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
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
