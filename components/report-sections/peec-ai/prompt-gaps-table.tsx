'use client'

import type { PromptGapRow, PromptGapStatus } from '@/lib/peec/prompt-gaps'
import { SortableTable, type SortableColumn } from './sortable-table'

const STATUS_LABEL: Record<PromptGapStatus, string> = {
  'not-cited': 'Not cited',
  lost: 'Lost',
  declining: 'Declining',
}
const STATUS_ORDER: Record<PromptGapStatus, number> = { 'not-cited': 0, lost: 1, declining: 2 }

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const COLUMNS: SortableColumn<PromptGapRow>[] = [
  { key: 'text', label: 'Prompt', accessor: (r) => r.text.toLowerCase(), render: (r) => <span className="text-white">{r.text}</span> },
  { key: 'topic', label: 'Topic', accessor: (r) => r.topic.toLowerCase(), render: (r) => r.topic || '--' },
  {
    key: 'status', label: 'Status',
    accessor: (r) => STATUS_ORDER[r.status],
    render: (r) => <span className="whitespace-nowrap text-xs font-semibold text-white">{STATUS_LABEL[r.status]}</span>,
  },
  {
    key: 'otherSites', label: 'Other sites cited', sortable: false,
    render: (r) => r.otherSites.length === 0 ? '--' : (
      <div className="flex flex-col gap-0.5">
        {r.otherSites.map((s) => (
          <div key={s.url} className="flex items-center gap-1.5">
            <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}
              className="max-w-[240px] truncate text-[11px] text-white/60 underline-offset-2 hover:text-white hover:underline">
              {host(s.url)}
            </a>
            {s.namesCompetitor && (
              <span className="rounded bg-[#FF6B6B]/10 px-1 py-0.5 text-[10px] font-bold text-[#FF6B6B]">competitor</span>
            )}
          </div>
        ))}
        {r.otherSitesMore > 0 && <span className="text-[10px] text-white/40">{`+${r.otherSitesMore}`}</span>}
      </div>
    ),
  },
]

export function PromptGapsTable({ rows }: { rows: PromptGapRow[] }) {
  return (
    <SortableTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.promptId}
      initialPageSize={10}
      defaultSortKey="status"
      defaultSortDir="asc"
      emptyMessage="No prompt gaps in this period"
    />
  )
}
