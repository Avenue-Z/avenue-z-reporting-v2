'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useExportMode } from '@/components/export/export-mode'
import type { CitedUrlRow, CitedUrls, SourceType } from '@/lib/aeo/cited-urls'
import { SortableTable, type SortableColumn } from '../sortable-table'
import { deltaColumn } from './delta-columns'
import { pctChange } from './delta'

type Chip = 'all' | SourceType
const CHIPS: { value: Chip; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Your URLs' },
  { value: 'competitor', label: 'Competitor URLs' },
  { value: 'third_party', label: 'Third-party' },
]

type Row = CitedUrlRow & { usedDelta: number | null; rateDelta: number | null }

const TIPS = {
  peec: {
    used: 'Share of AI answers that retrieved this page as a source.',
    rate: 'Average times this page is cited in an answer that retrieved it.',
  },
  profound: {
    used: 'Share of AI answers (Visibility prompts) that cited this page.',
    rate: 'Average times this page is cited in an answer that cites it.',
  },
} as const

export function CitedSourcesTable({ data, showDeltas, modelActive }: { data: CitedUrls; showDeltas: boolean; modelActive: boolean }) {
  const exportMode = useExportMode()
  const [chip, setChip] = useState<Chip>('all')

  const rows = useMemo<Row[]>(
    () =>
      data.rows.map((r) => ({
        ...r,
        usedDelta: r.prior?.usedPct != null && r.usedPct != null ? r.usedPct - r.prior.usedPct : null,
        rateDelta: r.citationRate != null ? pctChange(r.citationRate, r.prior?.citationRate) : null,
      })),
    [data.rows],
  )

  const activeChip: Chip = exportMode ? 'all' : chip
  const shown = activeChip === 'all' ? rows : rows.filter((r) => r.sourceType === activeChip)

  const columns = useMemo(() => {
    const tips = TIPS[data.provider]
    const withDeltas = showDeltas && data.compared
    const isNew = (r: Row) => data.compared && r.prior === null
    const cols: SortableColumn<Row>[] = [
      { key: 'rank', label: '#', accessor: (r) => r.rank, filterable: false },
      {
        key: 'page',
        label: 'Page',
        accessor: (r) => r.title ?? r.url,
        render: (r) => (
          <div className="min-w-0">
            {r.title !== null && <div className="text-white break-words">{r.title}</div>}
            <div className="text-text-muted break-all">{r.url}</div>
          </div>
        ),
      },
      { key: 'sourceLabel', label: 'Source type', accessor: (r) => r.sourceLabel },
    ]
    if (data.hasPageType) {
      cols.push({ key: 'pageType', label: 'Page type', accessor: (r) => r.pageType, render: (r) => r.pageType ?? '–' })
    }
    cols.push({
      key: 'usedPct',
      label: 'Used as a source %',
      tooltip: tips.used,
      align: 'right',
      accessor: (r) => r.usedPct,
      render: (r) => (r.usedPct == null ? '–' : `${r.usedPct.toFixed(1)}%`),
    })
    if (withDeltas) {
      cols.push(deltaColumn<Row>({ key: 'usedDelta', accessor: (r) => r.usedDelta, unit: 'pts', betterWhen: 'higher', isNew }))
    }
    cols.push({
      key: 'citationRate',
      label: 'Citation rate',
      tooltip: tips.rate,
      align: 'right',
      accessor: (r) => r.citationRate,
      render: (r) => (r.citationRate == null ? '–' : r.citationRate.toFixed(2)),
    })
    if (withDeltas) {
      cols.push(deltaColumn<Row>({ key: 'rateDelta', accessor: (r) => r.rateDelta, unit: 'pct', betterWhen: 'higher', isNew }))
    }
    return cols
  }, [data.provider, data.compared, data.hasPageType, showDeltas])

  const emptyMessage = data.tooLong
    ? 'Choose a date range of 92 days or less to see cited pages.'
    : rows.length === 0
      ? 'No cited pages for this period.'
      : 'No URLs of this type in this period.'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <span>{data.totalCitations.toLocaleString()} citations</span>
        {modelActive && <span>Not filtered by AI model.</span>}
      </div>
      {!exportMode && (
        <div role="radiogroup" aria-label="Filter by source" className="flex flex-wrap gap-2">
          {CHIPS.map((c) => {
            const on = chip === c.value
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChip(c.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs',
                  on ? 'border-[#60FDFF] text-white' : 'border-white/10 text-text-muted hover:text-white',
                )}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}
      <SortableTable<Row>
        columns={columns}
        rows={shown}
        rowKey={(r) => r.key}
        initialPageSize={10}
        defaultSortKey="usedPct"
        defaultSortDir="desc"
        rowClassName={(r) => (r.sourceType === 'own' ? 'bg-[#60FDFF]/[0.06] shadow-[inset_2px_0_0_#60FDFF]' : '')}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}
