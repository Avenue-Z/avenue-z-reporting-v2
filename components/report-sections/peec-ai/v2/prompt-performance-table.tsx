'use client'

import { useState } from 'react'
import { useExportMode } from '@/components/export/export-mode'
import { cn } from '@/lib/utils'
import { SortableTable, type SortableColumn } from '../sortable-table'
import { deltaTone, formatDelta } from './delta'
import { TONE_CLASS, deltaColumn } from './delta-columns'
import { promptChange, type PromptPerfRow } from './topics'

type Group = 'all' | 'gained' | 'lost' | 'same'
const CHIPS: { id: Group; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'gained', label: 'Gained' },
  { id: 'lost', label: 'Lost' },
  { id: 'same', label: 'No change' },
]

const RANK_TOOLTIP = 'Average position of the brand in AI answers that mention it, across the selected models. Lower is better.'

/**
 * Rank Δ: places moved (prior − current), `New` for a prompt with no answers in the comparison window, and words for a
 * prompt the client entered (`Newly ranked`) or left (`No longer ranked`) with answers in both windows. Sorting puts
 * entered above every numeric gain and dropped below every numeric loss; New and no data sink last in both directions.
 */
const rankDeltaColumn: SortableColumn<PromptPerfRow> = {
  key: 'rankDelta',
  label: 'Rank Δ',
  align: 'right',
  sortable: true,
  filterable: false,
  accessor: (r) =>
    r.isNew ? null : r.rankChange === 'entered' ? Number.MAX_VALUE : r.rankChange === 'dropped' ? -Number.MAX_VALUE : r.rankDelta,
  render: (r) => {
    const [text, tone] = r.isNew
      ? ['New', 'neutral' as const]
      : r.rankChange === 'entered'
        ? ['Newly ranked', 'good' as const]
        : r.rankChange === 'dropped'
          ? ['No longer ranked', 'bad' as const]
          : [formatDelta(r.rankDelta, 'places'), deltaTone(r.rankDelta, 'higher', 'places')]
    return (
      <span className={cn('tabular-nums', TONE_CLASS[tone])} title={text === '–' ? 'No comparison data' : undefined}>
        {text}
      </span>
    )
  },
}

/**
 * Section 04's Prompt Performance table: the client's average rank and visibility on each tracked prompt. The filter
 * chips are local state; New rows and rows with no rank change appear under All only. The PDF prints All, without chips.
 */
export function PromptPerformanceTable({ rows, showDeltas }: { rows: PromptPerfRow[]; showDeltas: boolean }) {
  const [group, setGroup] = useState<Group>('all')
  const exporting = useExportMode()
  const chipsShown = showDeltas && !exporting
  const active: Group = chipsShown ? group : 'all'

  const counts: Record<Group, number> = { all: rows.length, gained: 0, lost: 0, same: 0 }
  for (const r of rows) {
    const c = promptChange(r)
    if (c) counts[c] += 1
  }
  const visible = active === 'all' ? rows : rows.filter((r) => promptChange(r) === active)

  const columns: SortableColumn<PromptPerfRow>[] = [
    {
      key: 'text',
      label: 'Prompt',
      align: 'left',
      cellClassName: 'whitespace-normal break-words',
      accessor: (r) => r.text,
      render: (r) => <span className="text-sm text-white">{r.text}</span>,
    },
    { key: 'topic', label: 'Topic', align: 'left', accessor: (r) => r.topic, render: (r) => <span className="text-xs text-text-muted">{r.topic}</span> },
    {
      key: 'rank',
      label: 'Rank',
      tooltip: RANK_TOOLTIP,
      align: 'right',
      filterable: false,
      accessor: (r) => r.rank,
      render: (r) => <span className="tabular-nums text-white">{r.rank?.toFixed(1) ?? '–'}</span>,
    },
  ]
  if (showDeltas) {
    columns.push(rankDeltaColumn)
  }
  columns.push({
    key: 'visibility',
    label: 'Visibility',
    align: 'right',
    filterable: false,
    accessor: (r) => r.visibility,
    render: (r) => <span className="tabular-nums text-white">{r.visibility.toFixed(1)}%</span>,
  })
  if (showDeltas) {
    columns.push(deltaColumn<PromptPerfRow>({ key: 'visibilityDelta', accessor: (r) => r.visibilityDelta, unit: 'pts', betterWhen: 'higher' }))
  }

  return (
    // Not one block in the export: 25 long prompts can run past a page, so the table splits between its rows
    // (SortableTable marks each data-export-row) and the title keeps with it.
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="border-b border-white/[0.06] px-5 py-4" data-export-keep-with-next="">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">How is the brand ranking on each tracked prompt?</p>
      </div>
      {chipsShown && (
        <div className="flex flex-wrap gap-2 px-5 pt-3">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={group === c.id}
              onClick={() => setGroup(c.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                group === c.id ? 'border-[#60FDFF] bg-white/[0.06] text-white' : 'border-white/[0.1] text-text-muted hover:text-white',
              )}
            >
              {c.label} <span className="tabular-nums">{counts[c.id]}</span>
            </button>
          ))}
        </div>
      )}
      <SortableTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.id}
        defaultSortKey={showDeltas ? 'rankDelta' : 'rank'}
        defaultSortDir={showDeltas ? 'desc' : 'asc'}
        initialPageSize={25}
        emptyMessage="No prompts in this group."
      />
    </div>
  )
}
