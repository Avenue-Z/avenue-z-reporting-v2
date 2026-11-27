'use client'

import { cn } from '@/lib/utils'
import type { BrandRowV2, UsedAsSourceBasis } from '@/lib/aeo/v2/types'
import { PEEC, PROFOUND } from '@/lib/peec/metric-definitions'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { SortableTable, type SortableColumn } from '../sortable-table'
import { deltaColumn } from './delta-columns'
import { FALLBACK_COLOR } from './brand-colors'

const USED_AS_SOURCE = {
  answers: {
    label: 'Used as a source %',
    tooltip: "Share of tracked AI answers that retrieved one of the brand's own domains.",
  },
  citations: {
    label: 'Citation share %',
    tooltip:
      "Share of all citations in tracked AI answers (Visibility prompts) that point to one of the brand's own domains. Profound does not report retrieval per answer.",
  },
} as const

const pct = (n: number | null) => (n == null ? '–' : `${n.toFixed(1)}%`)
const diff = (v: number | null, prior: number | null) => (v == null || prior == null ? null : v - prior)

/**
 * Section 02's brand table: Visibility, Share of voice and Used as a source % (Citation share % for Profound), each with
 * its own Δ column. The client is pinned as a last row when it ranks outside the visible page.
 */
export function BrandTableV2({
  rows,
  colors,
  showDeltas,
  usedAsSourceBasis,
  note,
}: {
  rows: BrandRowV2[]
  /** Brand name -> dot color (`brandColors`); a Map, since brand names are vendor data. */
  colors: ReadonlyMap<string, string>
  showDeltas: boolean
  usedAsSourceBasis: UsedAsSourceBasis
  note: string | null
}) {
  const used = USED_AS_SOURCE[usedAsSourceBasis]
  // Citation share is Profound's basis: its table quotes Profound's own definitions.
  const defs = usedAsSourceBasis === 'citations' ? PROFOUND : PEEC
  const metric = (
    key: 'visibility' | 'sov' | 'usedAsSource',
    label: string,
    tooltip: string,
  ): SortableColumn<BrandRowV2>[] => {
    const prior = `${key}Prior` as 'visibilityPrior' | 'sovPrior' | 'usedAsSourcePrior'
    const cols: SortableColumn<BrandRowV2>[] = [
      {
        key,
        label,
        align: 'right',
        tooltip,
        accessor: (r) => r[key],
        render: (r) => <span className="tabular-nums text-white">{pct(r[key])}</span>,
      },
    ]
    if (showDeltas) {
      cols.push(
        deltaColumn<BrandRowV2>({
          key: `${key}Delta`,
          unit: 'pts',
          betterWhen: 'higher',
          accessor: (r) => diff(r[key], r[prior]),
        }),
      )
    }
    return cols
  }

  const columns: SortableColumn<BrandRowV2>[] = [
    {
      key: 'rank',
      label: '#',
      align: 'center',
      sortable: true,
      filterable: false,
      width: '3rem',
      accessor: (r) => r.rank,
      render: (r) => <span className="text-xs text-text-muted">#{r.rank}</span>,
    },
    {
      key: 'name',
      label: 'Brand',
      align: 'left',
      accessor: (r) => r.name,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: colors.get(r.name) ?? FALLBACK_COLOR }}
          />
          <span className={cn('text-sm font-semibold', r.isYou ? 'text-[#60FDFF]' : 'text-white')}>{r.name}</span>
        </span>
      ),
    },
    ...metric('visibility', 'Visibility', defs.visibility.text),
    ...metric('sov', 'Share of voice', defs.sov.text),
    ...metric('usedAsSource', used.label, used.tooltip),
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-5 py-4" data-export-keep-with-next="">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Which brands appear most often in AI answers?</p>
        <InfoTooltip text={`Brand visibility across all brands tracked. ${defs.visibility.text}`} />
      </div>
      {note && <p className="px-5 pt-3 text-xs text-text-muted">{note}</p>}
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.name}
        defaultSortKey="rank"
        defaultSortDir="asc"
        initialPageSize={10}
        pinnedRow={(r) => r.isYou}
        rowClassName={(r) => (r.isYou ? 'bg-white/[0.03]' : '')}
        emptyMessage="No brand rankings available."
      />
    </div>
  )
}
