'use client'

import type { LLMBreakdown } from '@/lib/peec/client'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC } from '@/lib/peec/metric-definitions'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { MODEL_COLORS, MODEL_DISPLAY_LABELS, type AEOModel } from '@/lib/peec/models'

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
        const color = MODEL_COLORS[b.model as keyof typeof MODEL_COLORS] ?? '#8A8A8A'
        return (
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-white">{MODEL_DISPLAY_LABELS[b.model as AEOModel] ?? b.model}</span>
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
        const color = MODEL_COLORS[b.model as keyof typeof MODEL_COLORS] ?? '#8A8A8A'
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
        <InfoTooltip text="Brand visibility and domain citation metrics broken down by AI model, year-to-date. Data sourced from Peec AI." />
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
