'use client'

import type { LLMBreakdown } from '@/lib/peec/client'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC } from '@/lib/peec/metric-definitions'

const MODEL_COLORS: Record<string, string> = {
  ChatGPT:    '#10A37F',
  Perplexity: '#26C7C8',
  Gemini:     '#4285F4',
  Claude:     '#CC785C',
  Copilot:    '#0078D4',
  Google:     '#34A853',
}

function VisibilityBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="tabular-nums text-sm text-white">{value.toFixed(1)}%</span>
    </div>
  )
}

export function LLMBreakdownTable({ breakdown }: { breakdown: LLMBreakdown[] }) {
  if (breakdown.length === 0) return null

  const maxVisibility = Math.max(...breakdown.map((b) => b.visibility), 1)
  const hasOwnDomain = breakdown.some((b) => b.ownDomainRetrieved > 0)

  const columns: SortableColumn<LLMBreakdown>[] = [
    {
      key: 'model',
      label: 'AI Model',
      align: 'left',
      accessor: (b) => b.model,
      render: (b) => {
        const color = MODEL_COLORS[b.model] ?? '#8A8A8A'
        return (
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-white">{b.model}</span>
          </span>
        )
      },
    },
    {
      key: 'visibility',
      label: 'Visibility',
      align: 'left',
      tooltip: PEEC.visibility.text,
      accessor: (b) => b.visibility,
      render: (b) => {
        const color = MODEL_COLORS[b.model] ?? '#8A8A8A'
        return <VisibilityBar value={b.visibility} max={maxVisibility} color={color} />
      },
    },
    {
      key: 'sov',
      label: 'SOV',
      align: 'right',
      tooltip: PEEC.sov.text,
      accessor: (b) => b.sov,
      render: (b) =>
        b.sov > 0
          ? <span className="tabular-nums text-white">{b.sov.toFixed(1)}%</span>
          : <span className="text-text-muted">—</span>,
    },
    {
      key: 'position',
      label: 'Position',
      align: 'right',
      tooltip: PEEC.position.text,
      accessor: (b) => b.position,
      render: (b) =>
        b.position > 0
          ? <span className="tabular-nums text-white">#{b.position.toFixed(1)}</span>
          : <span className="text-text-muted">—</span>,
    },
    ...(hasOwnDomain
      ? [{
          key: 'ownDomainRetrieved',
          label: 'Domain Retrieved',
          align: 'right' as const,
          tooltip: PEEC.retrieved.text,
          accessor: (b: LLMBreakdown) => b.ownDomainRetrieved,
          render: (b: LLMBreakdown) =>
            b.ownDomainRetrieved > 0
              ? <span className="tabular-nums text-white">{b.ownDomainRetrieved.toFixed(1)}%</span>
              : <span className="text-text-muted">—</span>,
        }]
      : []),
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">How does brand performance vary across AI models?</p>
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Brand visibility and domain citation metrics broken down by AI model, year-to-date. Data sourced from Peec AI.
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </span>
        </span>
      </div>
      <SortableTable
        columns={columns}
        rows={breakdown}
        rowKey={(b) => b.model}
        emptyMessage="No AI model breakdown available."
      />
    </div>
  )
}
