import type { PromptGapRow, PromptGapStatus, PromptGapsResult } from '@/lib/peec/prompt-gaps'
import type { ReportAudience } from './ctx'
import { SortableTable, type SortableColumn } from './sortable-table'
import { ClientVisibleSwitch } from './client-visible-switch'

export const PROMPT_GAPS_VIEW_KEY = 'peec-ai:content-impact'
export const PROMPT_GAPS_BLOCK_ID = 'prompt-gaps'

const STATUS_LABEL: Record<PromptGapStatus, string> = {
  'not-cited': 'Not cited',
  lost: 'Lost',
  declining: 'Declining',
}
const STATUS_ORDER: Record<PromptGapStatus, number> = { 'not-cited': 0, lost: 1, declining: 2 }

const ERROR_COPY = {
  incomplete: "Prompt data from Peec came back incomplete, so gaps aren't shown. This usually clears on the next refresh.",
  unavailable: "Prompt data from Peec couldn't be loaded.",
} as const

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

export function PromptGapsBlock({
  result,
  audience,
  clientVisible,
  canToggle,
  clientSlug,
}: {
  result: PromptGapsResult
  audience: ReportAudience
  clientVisible: boolean
  canToggle: boolean
  clientSlug: string
}) {
  if (audience === 'client' && !clientVisible) return null
  const showChip = audience === 'internal' && !clientVisible

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6" data-export-block="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div data-export-keep-with-next="">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Prompt gaps</h3>
            {showChip && (
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-white/60">Internal</span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Tracked prompts where no owned page is cited, was cited last period but isn&apos;t now, or where our average position fell, compared with the previous period.
          </p>
        </div>
        {canToggle && (
          <ClientVisibleSwitch clientSlug={clientSlug} viewKey={PROMPT_GAPS_VIEW_KEY} blockId={PROMPT_GAPS_BLOCK_ID} checked={clientVisible} />
        )}
      </div>
      {result.ok ? (
        <SortableTable
          columns={COLUMNS}
          rows={result.rows}
          rowKey={(r) => r.promptId}
          initialPageSize={10}
          defaultSortKey="status"
          defaultSortDir="asc"
          emptyMessage="No prompt gaps in this period"
        />
      ) : (
        <p className="text-xs text-text-muted">{ERROR_COPY[result.reason]}</p>
      )}
    </div>
  )
}
